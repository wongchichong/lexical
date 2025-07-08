/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { LexicalEditor, EditorState, Klass, EditorUpdateOptions } from './LexicalCore';
import type { NodeKey, LexicalNode } from './LexicalCore';
import { $isElementNode, ElementNode } from './nodes/LexicalElementNode';
import { $createTextNode, $isTextNode, TextNode, type TextFormatType } from './nodes/LexicalTextNode';
import { $createLineBreakNode, $isLineBreakNode } from './nodes/LexicalLineBreakNode';
import { $createParagraphNode } from './nodes/LexicalParagraphNode';
import { $isRootNode, RootNode } from './nodes/LexicalRootNode';
import { $createTabNode, $isTabNode } from './nodes/LexicalTabNode';
import { $isDecoratorNode } from './nodes/LexicalDecoratorNode';


import invariant from 'shared/invariant';
import { TEXT_TYPE_TO_FORMAT } from './LexicalConstants';
import { markCollapsedSelectionFormat, markSelectionChangeFromDOMUpdate } from './LexicalEvents';
import { getIsProcessingMutations } from './LexicalMutations';
import { $normalizeSelection as $normalizeSelectionNormalization } from './LexicalNormalization';
import {
    getActiveEditor,
    getActiveEditorState,
    isCurrentlyReadOnlyMode,
    errorOnReadOnly
} from './LexicalUpdates';

import {
  $getAncestor,
  $getCompositionKey,
  $getNearestRootOrShadowRoot,
  $getNodeByKey,
  $getNodeFromDOMNode,
  $getRoot,
  $hasAncestor,
  $isRootOrShadowRoot,
  $isTokenOrSegmented,
  $isTokenOrTab,
  $setCompositionKey,
  $setSelection as $setSelectionHelper,
  doesContainSurrogatePair,
  getDOMSelection,
  getDOMTextNode,
  getElementByKeyOrThrow,
  getTextNodeOffset,
  getWindow,
  INTERNAL_$isBlock,
  isHTMLElement,
  isSelectionCapturedInDecoratorInput,
  isSelectionWithinEditor,
  removeDOMBlockCursorElement,
  scrollIntoViewIfNeeded,
  toggleTextFormatType,
  $updateSelectedTextFromDOM,
  $shouldInsertTextAfterOrBeforeTextNode,
} from './LexicalUtils';

import {
  $comparePointCaretNext,
  $extendCaretToRange,
  $getAdjacentChildCaret,
  $getCaretRange,
  $getChildCaret,
  $getSiblingCaret,
  $isChildCaret,
  $isSiblingCaret,
  $isTextPointCaret,
  type CaretRange,
  type ChildCaret,
  type NodeCaret,
  type PointCaret
} from './caret/LexicalCaret';
import {
  $caretFromPoint,
  $caretRangeFromSelection,
  $getCaretRangeInDirection,
  $isExtendableTextPointCaret,
  $normalizeCaret,
  $removeTextFromCaretRange,
  $rewindSiblingCaret,
  $setPointFromCaret,
  $setSelectionFromCaretRange,
  $updateRangeSelectionFromCaretRange
} from './caret/LexicalCaretUtils';

import { COLLABORATION_TAG, SKIP_SCROLL_INTO_VIEW_TAG } from './LexicalUpdateTags';
import { PointOffsetType } from 'lexical'; // This seems to be a new type, ensure it's correct or defined

export type TextPointType = {
  _selection: BaseSelection;
  getNode: () => TextNode;
  is: (point: PointType) => boolean;
  isBefore: (point: PointType) => boolean;
  key: NodeKey;
  offset: number;
  set: (
    key: NodeKey,
    offset: number,
    type: 'text' | 'element',
    onlyIfChanged?: boolean,
  ) => void;
  type: 'text';
};

export type ElementPointType = {
  _selection: BaseSelection;
  getNode: () => ElementNode;
  is: (point: PointType) => boolean;
  isBefore: (point: PointType) => boolean;
  key: NodeKey;
  offset: number;
  set: (
    key: NodeKey,
    offset: number,
    type: 'text' | 'element',
    onlyIfChanged?: boolean,
  ) => void;
  type: 'element';
};

export type PointType = TextPointType | ElementPointType;

export class Point {
  key: NodeKey;
  offset: number;
  type: 'text' | 'element';
  _selection: BaseSelection | null;

  constructor(key: NodeKey, offset: number, type: 'text' | 'element') {
    if (__DEV__) {
      Object.defineProperty(this, '_selection', {
        enumerable: false,
        writable: true,
      });
    }
    this._selection = null;
    this.key = key;
    this.offset = offset;
    this.type = type;
  }

  is(point: PointType): boolean {
    return (
      this.key === point.key &&
      this.offset === point.offset &&
      this.type === point.type
    );
  }

  isBefore(b: PointType): boolean {
    if (this.key === b.key) {
      return this.offset < b.offset;
    }
    const aCaret = $normalizeCaret($caretFromPoint(this, 'next'));
    const bCaret = $normalizeCaret($caretFromPoint(b, 'next'));
    return $comparePointCaretNext(aCaret, bCaret) < 0;
  }

  getNode(): LexicalNode {
    const key = this.key;
    const node = $getNodeByKey(key);
    if (node === null) {
      invariant(false, 'Point.getNode: node not found');
    }
    return node;
  }

  set(
    key: NodeKey,
    offset: number,
    type: 'text' | 'element',
    onlyIfChanged?: boolean,
  ): void {
    const selection = this._selection;
    const oldKey = this.key;
    if (
      onlyIfChanged &&
      this.key === key &&
      this.offset === offset &&
      this.type === type
    ) {
      return;
    }
    this.key = key;
    this.offset = offset;
    this.type = type;
    if (__DEV__) {
      const node = $getNodeByKey(key);
      invariant(
        type === 'text' ? $isTextNode(node) : $isElementNode(node),
        'PointType.set: node with key %s is %s and can not be used for a %s point',
        key,
        node ? node.getType() : '[not found]',
        type,
      );
    }
    if (!isCurrentlyReadOnlyMode()) {
      if ($getCompositionKey() === oldKey) {
        $setCompositionKey(key);
      }
      if (selection !== null) {
        selection.setCachedNodes(null);
        selection.dirty = true;
      }
    }
  }
}

export function $createPoint(
  key: NodeKey,
  offset: number,
  type: 'text' | 'element',
): PointType {
  // @ts-expect-error: intentionally cast as we use a class for perf reasons
  return new Point(key, offset, type);
}

function selectPointOnNode(point: PointType, node: LexicalNode): void {
  let key = node.getKey();
  let offset = point.offset;
  let type: 'element' | 'text' = 'element';
  if ($isTextNode(node)) {
    type = 'text';
    const textContentLength = node.getTextContentSize();
    if (offset > textContentLength) {
      offset = textContentLength;
    }
  } else if (!$isElementNode(node)) {
    const nextSibling = node.getNextSibling();
    if ($isTextNode(nextSibling)) {
      key = nextSibling.getKey();
      offset = 0;
      type = 'text';
    } else {
      const parentNode = node.getParent();
      if (parentNode) {
        key = parentNode.getKey();
        offset = node.getIndexWithinParent() + 1;
      }
    }
  }
  point.set(key, offset, type);
}

export function $moveSelectionPointToEnd(
  point: PointType,
  node: LexicalNode,
): void {
  if ($isElementNode(node)) {
    const lastNode = node.getLastDescendant();
    if ($isElementNode(lastNode) || $isTextNode(lastNode)) {
      selectPointOnNode(point, lastNode);
    } else {
      selectPointOnNode(point, node);
    }
  } else {
    selectPointOnNode(point, node);
  }
}

function $transferStartingElementPointToTextPoint(
  start: ElementPointType,
  end: PointType,
  format: number,
  style: string,
): void {
  const element = start.getNode();
  const placementNode = element.getChildAtIndex(start.offset);
  const textNode = $createTextNode();
  const target = $isRootNode(element)
    ? $createParagraphNode().append(textNode)
    : textNode;
  textNode.setFormat(format);
  textNode.setStyle(style);
  if (placementNode === null) {
    element.append(target);
  } else {
    placementNode.insertBefore(target);
  }
  if (start.is(end)) {
    end.set(textNode.getKey(), 0, 'text');
  }
  start.set(textNode.getKey(), 0, 'text');
}

export interface BaseSelection {
  _cachedNodes: Array<LexicalNode> | null;
  dirty: boolean;

  clone(): BaseSelection;
  extract(): Array<LexicalNode>;
  getNodes(): Array<LexicalNode>;
  getTextContent(): string;
  insertText(text: string): void;
  insertRawText(text: string): void;
  is(selection: null | BaseSelection): boolean;
  insertNodes(nodes: Array<LexicalNode>): void;
  getStartEndPoints(): null | [PointType, PointType];
  isCollapsed(): boolean;
  isBackward(): boolean;
  getCachedNodes(): LexicalNode[] | null;
  setCachedNodes(nodes: LexicalNode[] | null): void;
}

export class NodeSelection implements BaseSelection {
  _nodes: Set<NodeKey>;
  _cachedNodes: Array<LexicalNode> | null;
  dirty: boolean;

  constructor(objects: Set<NodeKey>) {
    this._cachedNodes = null;
    this._nodes = objects;
    this.dirty = false;
  }

  getCachedNodes(): LexicalNode[] | null {
    return this._cachedNodes;
  }

  setCachedNodes(nodes: LexicalNode[] | null): void {
    this._cachedNodes = nodes;
  }

  is(selection: null | BaseSelection): boolean {
    if (!$isNodeSelection(selection)) {
      return false;
    }
    const a: Set<NodeKey> = this._nodes;
    const b: Set<NodeKey> = selection._nodes;
    return a.size === b.size && Array.from(a).every((key) => b.has(key));
  }

  isCollapsed(): boolean {
    return false;
  }

  isBackward(): boolean {
    return false;
  }

  getStartEndPoints(): null {
    return null;
  }

  add(key: NodeKey): void {
    this.dirty = true;
    this._nodes.add(key);
    this._cachedNodes = null;
  }

  delete(key: NodeKey): void {
    this.dirty = true;
    this._nodes.delete(key);
    this._cachedNodes = null;
  }

  clear(): void {
    this.dirty = true;
    this._nodes.clear();
    this._cachedNodes = null;
  }

  has(key: NodeKey): boolean {
    return this._nodes.has(key);
  }

  clone(): NodeSelection {
    return new NodeSelection(new Set(this._nodes));
  }

  extract(): Array<LexicalNode> {
    return this.getNodes();
  }

  insertRawText(text: string): void {
  }

  insertText(): void {
  }

  insertNodes(nodes: Array<LexicalNode>): void {
    const selectedNodes = this.getNodes();
    const selectedNodesLength = selectedNodes.length;
    const lastSelectedNode = selectedNodes[selectedNodesLength - 1];
    let selectionAtEnd: RangeSelection;
    if ($isTextNode(lastSelectedNode)) {
      selectionAtEnd = lastSelectedNode.select();
    } else if ($isElementNode(lastSelectedNode)){
      const index = lastSelectedNode.getIndexWithinParent() + 1;
      selectionAtEnd = lastSelectedNode.getParentOrThrow().select(index, index);
    } else {
        const parent = lastSelectedNode.getParentOrThrow();
        selectionAtEnd = parent.select(parent.getChildrenSize(), parent.getChildrenSize());
    }
    selectionAtEnd.insertNodes(nodes);
    for (let i = 0; i < selectedNodesLength; i++) {
      selectedNodes[i].remove();
    }
  }


  getNodes(): Array<LexicalNode> {
    const cachedNodes = this._cachedNodes;
    if (cachedNodes !== null) {
      return cachedNodes;
    }
    const objects = this._nodes;
    const nodes = [];
    for (const object of objects) {
      const node = $getNodeByKey(object);
      if (node !== null) {
        nodes.push(node);
      }
    }
    if (!isCurrentlyReadOnlyMode()) {
      this._cachedNodes = nodes;
    }
    return nodes;
  }

  getTextContent(): string {
    const nodes = this.getNodes();
    let textContent = '';
    for (let i = 0; i < nodes.length; i++) {
      textContent += nodes[i].getTextContent();
    }
    return textContent;
  }

  deleteNodes(): void {
    const nodes = this.getNodes();
    if (($getSelection() || $getPreviousSelection()) === this && nodes[0]) {
      const firstCaret = $getSiblingCaret(nodes[0], 'next');
      if (firstCaret) {
        $setSelectionFromCaretRange($getCaretRange(firstCaret, firstCaret));
      }
    }
    for (const node of nodes) {
      node.remove();
    }
  }
}

export function $isRangeSelection(x: unknown): x is RangeSelection {
  return x instanceof RangeSelection;
}

export class RangeSelection implements BaseSelection {
  format: number;
  style: string;
  anchor: PointType;
  focus: PointType;
  _cachedNodes: Array<LexicalNode> | null;
  dirty: boolean;

  constructor(
    anchor: PointType,
    focus: PointType,
    format: number,
    style: string,
  ) {
    this.anchor = anchor;
    this.focus = focus;
    anchor._selection = this;
    focus._selection = this;
    this._cachedNodes = null;
    this.format = format;
    this.style = style;
    this.dirty = false;
  }

  getCachedNodes(): LexicalNode[] | null {
    return this._cachedNodes;
  }

  setCachedNodes(nodes: LexicalNode[] | null): void {
    this._cachedNodes = nodes;
  }

  is(selection: null | BaseSelection): boolean {
    if (!$isRangeSelection(selection)) {
      return false;
    }
    return (
      this.anchor.is(selection.anchor) &&
      this.focus.is(selection.focus) &&
      this.format === selection.format &&
      this.style === selection.style
    );
  }

  isCollapsed(): boolean {
    return this.anchor.is(this.focus);
  }

  getNodes(): Array<LexicalNode> {
    const cachedNodes = this._cachedNodes;
    if (cachedNodes !== null) {
      return cachedNodes;
    }
    const range = $getCaretRangeInDirection(
      $caretRangeFromSelection(this),
      'next',
    );
    const nodes = $getNodesFromCaretRangeCompat(range);
    if (__DEV__) {
      if (this.isCollapsed() && nodes.length > 1) {
        invariant(
          false,
          'RangeSelection.getNodes() returned %s > 1 nodes in a collapsed selection',
          String(nodes.length),
        );
      }
    }
    if (!isCurrentlyReadOnlyMode()) {
      this._cachedNodes = nodes;
    }
    return nodes;
  }

  setTextNodeRange(
    anchorNode: TextNode,
    anchorOffset: number,
    focusNode: TextNode,
    focusOffset: number,
  ): void {
    this.anchor.set(anchorNode.getKey(), anchorOffset, 'text');
    this.focus.set(focusNode.getKey(), focusOffset, 'text');
  }

  getTextContent(): string {
    const nodes = this.getNodes();
    if (nodes.length === 0) {
      return '';
    }
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    const anchor = this.anchor;
    const focus = this.focus;
    const isBefore = anchor.isBefore(focus);
    const [anchorOffset, focusOffset] = $getCharacterOffsets(this);
    let textContent = '';
    let prevWasElement = true;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if ($isElementNode(node) && !node.isInline()) {
        if (!prevWasElement) {
          textContent += '\n';
        }
        if (node.isEmpty()) {
          prevWasElement = false;
        } else {
          prevWasElement = true;
        }
      } else {
        prevWasElement = false;
        if ($isTextNode(node)) {
          let text = node.getTextContent();
          if (node === firstNode) {
            if (node === lastNode) {
              if (
                anchor.type !== 'element' ||
                focus.type !== 'element' ||
                focus.offset === anchor.offset
              ) {
                text =
                  anchorOffset < focusOffset
                    ? text.slice(anchorOffset, focusOffset)
                    : text.slice(focusOffset, anchorOffset);
              }
            } else {
              text = isBefore
                ? text.slice(anchorOffset)
                : text.slice(focusOffset);
            }
          } else if (node === lastNode) {
            text = isBefore
              ? text.slice(0, focusOffset)
              : text.slice(0, anchorOffset);
          }
          textContent += text;
        } else if (
          ($isDecoratorNode(node) || $isLineBreakNode(node)) &&
          (node !== lastNode || !this.isCollapsed())
        ) {
          textContent += node.getTextContent();
        }
      }
    }
    return textContent;
  }

  applyDOMRange(range: StaticRange): void {
    const editor = getActiveEditor();
    const currentEditorState = editor.getEditorState();
    const lastSelection = currentEditorState._selection;
    const resolvedSelectionPoints = $internalResolveSelectionPoints(
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset,
      editor,
      lastSelection,
    );
    if (resolvedSelectionPoints === null) {
      return;
    }
    const [anchorPoint, focusPoint] = resolvedSelectionPoints;
    this.anchor.set(
      anchorPoint.key,
      anchorPoint.offset,
      anchorPoint.type,
      true,
    );
    this.focus.set(focusPoint.key, focusPoint.offset, focusPoint.type, true);
    $normalizeSelectionNormalization(this);
  }

  clone(): RangeSelection {
    const anchor = this.anchor;
    const focus = this.focus;
    const selection = new RangeSelection(
      $createPoint(anchor.key, anchor.offset, anchor.type),
      $createPoint(focus.key, focus.offset, focus.type),
      this.format,
      this.style,
    );
    return selection;
  }

  toggleFormat(format: TextFormatType): void {
    this.format = toggleTextFormatType(this.format, format, null);
    this.dirty = true;
  }

  setStyle(style: string): void {
    this.style = style;
    this.dirty = true;
  }

  hasFormat(type: TextFormatType): boolean {
    const formatFlag = TEXT_TYPE_TO_FORMAT[type];
    return (this.format & formatFlag) !== 0;
  }

  insertRawText(text: string): void {
    const parts = text.split(/(\r?\n|\t)/);
    const nodes = [];
    const length = parts.length;
    for (let i = 0; i < length; i++) {
      const part = parts[i];
      if (part === '\n' || part === '\r\n') {
        nodes.push($createLineBreakNode());
      } else if (part === '\t') {
        nodes.push($createTabNode());
      } else {
        nodes.push($createTextNode(part));
      }
    }
    this.insertNodes(nodes);
  }

  insertText(text: string): void {
    const anchor = this.anchor;
    const focus = this.focus;
    const format = this.format;
    const style = this.style;
    let firstPoint = anchor;
    let endPoint = focus;
    if (!this.isCollapsed() && focus.isBefore(anchor)) {
      firstPoint = focus;
      endPoint = anchor;
    }
    if (firstPoint.type === 'element') {
      $transferStartingElementPointToTextPoint(
        firstPoint as ElementPointType,
        endPoint,
        format,
        style,
      );
    }
    if (endPoint.type === 'element') {
      $setPointFromCaret(
        endPoint,
        $normalizeCaret($caretFromPoint(endPoint, 'next')),
      );
    }
    const startOffset = firstPoint.offset;
    let endOffset = endPoint.offset;
    const selectedNodes = this.getNodes();
    const selectedNodesLength = selectedNodes.length;
    let firstNode: TextNode = selectedNodes[0] as TextNode;

    if (!$isTextNode(firstNode)) {
      invariant(false, 'insertText: first node is not a text node');
    }
    const firstNodeText = firstNode.getTextContent();
    const firstNodeTextLength = firstNodeText.length;
    const firstNodeParent = firstNode.getParentOrThrow();
    let lastNode = selectedNodes[selectedNodesLength - 1];

    if (selectedNodesLength === 1 && endPoint.type === 'element') {
      endOffset = firstNodeTextLength;
      endPoint.set(firstPoint.key, endOffset, 'text');
    }

    if (
      this.isCollapsed() &&
      startOffset === firstNodeTextLength &&
      ($isTokenOrSegmented(firstNode) ||
        !firstNode.canInsertTextAfter() ||
        (!firstNodeParent.canInsertTextAfter() &&
          firstNode.getNextSibling() === null))
    ) {
      let nextSibling = firstNode.getNextSibling<TextNode>();
      if (
        !$isTextNode(nextSibling) ||
        !nextSibling.canInsertTextBefore() ||
        $isTokenOrSegmented(nextSibling)
      ) {
        nextSibling = $createTextNode();
        nextSibling.setFormat(format);
        nextSibling.setStyle(style);
        if (!firstNodeParent.canInsertTextAfter()) {
          firstNodeParent.insertAfter(nextSibling);
        } else {
          firstNode.insertAfter(nextSibling);
        }
      }
      nextSibling.select(0, 0);
      firstNode = nextSibling;
      if (text !== '') {
        this.insertText(text);
        return;
      }
    } else if (
      this.isCollapsed() &&
      startOffset === 0 &&
      ($isTokenOrSegmented(firstNode) ||
        !firstNode.canInsertTextBefore() ||
        (!firstNodeParent.canInsertTextBefore() &&
          firstNode.getPreviousSibling() === null))
    ) {
      let prevSibling = firstNode.getPreviousSibling<TextNode>();
      if (!$isTextNode(prevSibling) || $isTokenOrSegmented(prevSibling)) {
        prevSibling = $createTextNode();
        prevSibling.setFormat(format);
        if (!firstNodeParent.canInsertTextBefore()) {
          firstNodeParent.insertBefore(prevSibling);
        } else {
          firstNode.insertBefore(prevSibling);
        }
      }
      prevSibling.select();
      firstNode = prevSibling;
      if (text !== '') {
        this.insertText(text);
        return;
      }
    } else if (firstNode.isSegmented() && startOffset !== firstNodeTextLength) {
      const textNode = $createTextNode(firstNode.getTextContent());
      textNode.setFormat(format);
      firstNode.replace(textNode);
      firstNode = textNode;
    } else if (!this.isCollapsed() && text !== '') {
      const lastNodeParent = lastNode.getParent();

      if (
        !firstNodeParent.canInsertTextBefore() ||
        !firstNodeParent.canInsertTextAfter() ||
        ($isElementNode(lastNodeParent) &&
          (!lastNodeParent.canInsertTextBefore() ||
            !lastNodeParent.canInsertTextAfter()))
      ) {
        this.insertText('');
        $normalizeSelectionPointsForBoundaries(this.anchor, this.focus, null);
        this.insertText(text);
        return;
      }
    }

    if (selectedNodesLength === 1) {
      if ($isTokenOrTab(firstNode)) {
        const textNode = $createTextNode(text);
        textNode.select();
        firstNode.replace(textNode);
        return;
      }
      const firstNodeFormat = firstNode.getFormat();
      const firstNodeStyle = firstNode.getStyle();

      if (
        startOffset === endOffset &&
        (firstNodeFormat !== format || firstNodeStyle !== style)
      ) {
        if (firstNode.getTextContent() === '') {
          firstNode.setFormat(format);
          firstNode.setStyle(style);
        } else {
          const textNode = $createTextNode(text);
          textNode.setFormat(format);
          textNode.setStyle(style);
          textNode.select();
          if (startOffset === 0) {
            firstNode.insertBefore(textNode, false);
          } else {
            const [targetNode] = firstNode.splitText(startOffset);
            targetNode.insertAfter(textNode, false);
          }
          if (textNode.isComposing() && this.anchor.type === 'text') {
            this.anchor.offset -= text.length;
          }
          return;
        }
      } else if ($isTabNode(firstNode)) {
        const textNode = $createTextNode(text);
        textNode.setFormat(format);
        textNode.setStyle(style);
        textNode.select();
        firstNode.replace(textNode);
        return;
      }
      const delCount = endOffset - startOffset;

      firstNode = firstNode.spliceText(startOffset, delCount, text, true);
      if (firstNode.getTextContent() === '') {
        firstNode.remove();
      } else if (this.anchor.type === 'text') {
        if (firstNode.isComposing()) {
          this.anchor.offset -= text.length;
        } else {
          this.format = firstNodeFormat;
          this.style = firstNodeStyle;
        }
      }
    } else {
      const markedNodeKeysForKeep = new Set([
        ...firstNode.getParentKeys(),
        ...lastNode.getParentKeys(),
      ]);

      const firstElement = $isElementNode(firstNode)
        ? firstNode
        : firstNode.getParentOrThrow();
      let lastElement = $isElementNode(lastNode)
        ? lastNode
        : lastNode.getParentOrThrow();
      let lastElementChild = lastNode;

      if (!firstElement.is(lastElement) && lastElement.isInline()) {
        do {
          lastElementChild = lastElement;
          lastElement = lastElement.getParentOrThrow();
        } while (lastElement.isInline());
      }

      if (
        (endPoint.type === 'text' &&
          (endOffset !== 0 || lastNode.getTextContent() === '')) ||
        (endPoint.type === 'element' &&
          lastNode.getIndexWithinParent() < endOffset)
      ) {
        if (
          $isTextNode(lastNode) &&
          !$isTokenOrTab(lastNode) &&
          endOffset !== lastNode.getTextContentSize()
        ) {
          if (lastNode.isSegmented()) {
            const textNode = $createTextNode(lastNode.getTextContent());
            lastNode.replace(textNode);
            lastNode = textNode;
          }
          if (!$isRootNode(endPoint.getNode()) && endPoint.type === 'text') {
            lastNode = (lastNode as TextNode).spliceText(0, endOffset, '');
          }
          markedNodeKeysForKeep.add(lastNode.getKey());
        } else {
          const lastNodeParent = lastNode.getParentOrThrow();
          if (
            !lastNodeParent.canBeEmpty() &&
            lastNodeParent.getChildrenSize() === 1
          ) {
            lastNodeParent.remove();
          } else {
            lastNode.remove();
          }
        }
      } else {
        markedNodeKeysForKeep.add(lastNode.getKey());
      }

      const lastNodeChildren = lastElement.getChildren();
      const selectedNodesSet = new Set(selectedNodes);
      const firstAndLastElementsAreEqual = firstElement.is(lastElement);

      const insertionTarget =
        firstElement.isInline() && firstNode.getNextSibling() === null
          ? firstElement
          : firstNode;

      for (let i = lastNodeChildren.length - 1; i >= 0; i--) {
        const lastNodeChild = lastNodeChildren[i];

        if (
          lastNodeChild.is(firstNode) ||
          ($isElementNode(lastNodeChild) && lastNodeChild.isParentOf(firstNode))
        ) {
          break;
        }

        if (lastNodeChild.isAttached()) {
          if (
            !selectedNodesSet.has(lastNodeChild) ||
            lastNodeChild.is(lastElementChild)
          ) {
            if (!firstAndLastElementsAreEqual) {
              insertionTarget.insertAfter(lastNodeChild, false);
            }
          } else {
            lastNodeChild.remove();
          }
        }
      }

      if (!firstAndLastElementsAreEqual) {
        let parent: ElementNode | null = lastElement;
        let lastRemovedParent = null;

        while (parent !== null) {
          const children = parent.getChildren();
          const childrenLength = children.length;
          if (
            childrenLength === 0 ||
            children[childrenLength - 1].is(lastRemovedParent)
          ) {
            markedNodeKeysForKeep.delete(parent.getKey());
            lastRemovedParent = parent;
          }
          parent = parent.getParent();
        }
      }

      if (!$isTokenOrTab(firstNode)) {
        firstNode = firstNode.spliceText(
          startOffset,
          firstNodeTextLength - startOffset,
          text,
          true,
        );
        if (firstNode.getTextContent() === '') {
          firstNode.remove();
        } else if (firstNode.isComposing() && this.anchor.type === 'text') {
          this.anchor.offset -= text.length;
        }
      } else if (startOffset === firstNodeTextLength) {
        firstNode.select();
      } else {
        const textNode = $createTextNode(text);
        textNode.select();
        firstNode.replace(textNode);
      }

      for (let i = 1; i < selectedNodesLength; i++) {
        const selectedNode = selectedNodes[i];
        const key = selectedNode.getKey();
        if (!markedNodeKeysForKeep.has(key)) {
          selectedNode.remove();
        }
      }
    }
  }

  removeText(): void {
    const isCurrentSelection = $getSelection() === this;
    const newRange = $removeTextFromCaretRange($caretRangeFromSelection(this));
    $updateRangeSelectionFromCaretRange(this, newRange);
    if (isCurrentSelection && $getSelection() !== this) {
      $setSelectionHelper(this);
    }
  }

  formatText(
    formatType: TextFormatType,
    alignWithFormat: number | null = null,
  ): void {
    if (this.isCollapsed()) {
      this.toggleFormat(formatType);
      $setCompositionKey(null);
      return;
    }

    const selectedNodes = this.getNodes();
    const selectedTextNodes: Array<TextNode> = [];
    for (const selectedNode of selectedNodes) {
      if ($isTextNode(selectedNode)) {
        selectedTextNodes.push(selectedNode);
      }
    }
    const applyFormatToElements = (alignWith: number | null) => {
      selectedNodes.forEach((node) => {
        if ($isElementNode(node)) {
          const newFormat = node.getFormatFlags(formatType, alignWith);
          node.setTextFormat(newFormat);
        }
      });
    };

    const selectedTextNodesLength = selectedTextNodes.length;
    if (selectedTextNodesLength === 0) {
      this.toggleFormat(formatType);
      $setCompositionKey(null);
      applyFormatToElements(alignWithFormat);
      return;
    }

    const anchor = this.anchor;
    const focus = this.focus;
    const isBackward = this.isBackward();
    const startPoint = isBackward ? focus : anchor;
    const endPoint = isBackward ? anchor : focus;

    let firstIndex = 0;
    let firstNode = selectedTextNodes[0];
    let startOffset = startPoint.type === 'element' ? 0 : startPoint.offset;

    if (
      startPoint.type === 'text' &&
      startOffset === firstNode.getTextContentSize() && selectedTextNodes[1]
    ) {
      firstIndex = 1;
      firstNode = selectedTextNodes[1];
      startOffset = 0;
    }

    if (firstNode == null) {
      return;
    }

    const firstNextFormat = firstNode.getFormatFlags(
      formatType,
      alignWithFormat,
    );
    applyFormatToElements(firstNextFormat);

    const lastIndex = selectedTextNodesLength - 1;
    let lastNode = selectedTextNodes[lastIndex];
    const endOffset =
      endPoint.type === 'text'
        ? endPoint.offset
        : lastNode.getTextContentSize();

    if (firstNode.is(lastNode)) {
      if (startOffset === endOffset) {
        return;
      }
      if (
        $isTokenOrSegmented(firstNode) ||
        (startOffset === 0 && endOffset === firstNode.getTextContentSize())
      ) {
        firstNode.setFormat(firstNextFormat);
      } else {
        const splitNodes = firstNode.splitText(startOffset, endOffset);
        const replacement = startOffset === 0 ? splitNodes[0] : splitNodes[1];
        replacement.setFormat(firstNextFormat);

        if (startPoint.type === 'text') {
          startPoint.set(replacement.getKey(), 0, 'text');
        }
        if (endPoint.type === 'text') {
          endPoint.set(replacement.getKey(), endOffset - startOffset, 'text');
        }
      }
      this.format = firstNextFormat;
      return;
    }
    if (startOffset !== 0 && !$isTokenOrSegmented(firstNode)) {
      [, firstNode as TextNode] = firstNode.splitText(startOffset);
      startOffset = 0;
    }
    firstNode.setFormat(firstNextFormat);

    const lastNextFormat = lastNode.getFormatFlags(formatType, firstNextFormat);
    if (endOffset > 0) {
      if (
        endOffset !== lastNode.getTextContentSize() &&
        !$isTokenOrSegmented(lastNode)
      ) {
        [lastNode as TextNode] = lastNode.splitText(endOffset);
      }
      lastNode.setFormat(lastNextFormat);
    }

    for (let i = firstIndex + 1; i < lastIndex; i++) {
      const textNode = selectedTextNodes[i];
      const nextFormat = textNode.getFormatFlags(formatType, lastNextFormat);
      textNode.setFormat(nextFormat);
    }

    if (startPoint.type === 'text') {
      startPoint.set(firstNode.getKey(), startOffset, 'text');
    }
    if (endPoint.type === 'text') {
      endPoint.set(lastNode.getKey(), endOffset, 'text');
    }
    this.format = firstNextFormat | lastNextFormat;
  }

  insertNodes(nodes: Array<LexicalNode>): void {
    if (nodes.length === 0) {
      return;
    }
    if (!this.isCollapsed()) {
      this.removeText();
    }
    if (this.anchor.key === 'root') {
      this.insertParagraph();
      const selection = $getSelection();
      invariant(
        $isRangeSelection(selection),
        'Expected RangeSelection after insertParagraph',
      );
      return selection.insertNodes(nodes);
    }

    const firstPoint = this.isBackward() ? this.focus : this.anchor;
    const firstNode = firstPoint.getNode();
    const firstBlock = $getAncestor(firstNode, INTERNAL_$isBlock);

    const last = nodes[nodes.length - 1]!;

    if ($isElementNode(firstBlock) && '__language' in firstBlock) {
      if (nodes[0] && '__language' in nodes[0]) {
        this.insertText((nodes[0] as TextNode).getTextContent());
      } else {
        const index = $removeTextAndSplitBlock(this);
        firstBlock.splice(index, 0, nodes);
        last.selectEnd();
      }
      return;
    }

    const notInline = (node: LexicalNode) =>
      ($isElementNode(node) || $isDecoratorNode(node)) && !node.isInline();

    if (!nodes.some(notInline)) {
      invariant(
        $isElementNode(firstBlock),
        'Expected node %s of type %s to have a block ElementNode ancestor',
        firstNode.constructor.name,
        firstNode.getType(),
      );
      const index = $removeTextAndSplitBlock(this);
      firstBlock.splice(index, 0, nodes);
      last.selectEnd();
      return;
    }

    const blocksParent = $wrapInlineNodes(nodes);
    const nodeToSelect = blocksParent.getLastDescendant()!;
    const blocks = blocksParent.getChildren();
    const isMergeable = (node: LexicalNode): node is ElementNode =>
      $isElementNode(node) &&
      INTERNAL_$isBlock(node) &&
      !node.isEmpty() &&
      $isElementNode(firstBlock) &&
      (!firstBlock.isEmpty() || firstBlock.canMergeWhenEmpty());

    const shouldInsert = !$isElementNode(firstBlock) || !firstBlock.isEmpty();
    const insertedParagraph = shouldInsert ? this.insertParagraph() : null;
    const lastToInsert: LexicalNode | undefined = blocks[blocks.length - 1];
    let firstToInsert: LexicalNode | undefined = blocks[0];
    if (isMergeable(firstToInsert)) {
      invariant(
        $isElementNode(firstBlock),
        'Expected node %s of type %s to have a block ElementNode ancestor',
        firstNode.constructor.name,
        firstNode.getType(),
      );
      firstBlock.append(...firstToInsert.getChildren());
      firstToInsert = blocks[1];
    }
    if (firstToInsert) {
      invariant(
        firstBlock !== null,
        'Expected node %s of type %s to have a block ancestor',
        firstNode.constructor.name,
        firstNode.getType(),
      );
      let currentTargetNode: LexicalNode = firstBlock;
      const startIndex = blocks.indexOf(firstToInsert);
      if (startIndex !== -1) {
        for (let i = startIndex; i < blocks.length; i++) {
          const blockToInsert = blocks[i];
          if (blockToInsert) {
            currentTargetNode = currentTargetNode.insertAfter(blockToInsert);
          }
        }
      }
    }
    const lastInsertedBlock = $getAncestor(nodeToSelect, INTERNAL_$isBlock);

    if (
      insertedParagraph &&
      $isElementNode(lastInsertedBlock) &&
      (insertedParagraph.canMergeWhenEmpty() || ($isElementNode(lastToInsert) && INTERNAL_$isBlock(lastToInsert)))
    ) {
      lastInsertedBlock.append(...insertedParagraph.getChildren());
      insertedParagraph.remove();
    }
    if ($isElementNode(firstBlock) && firstBlock.isEmpty()) {
      firstBlock.remove();
    }

    nodeToSelect.selectEnd();

    const lastChild = $isElementNode(firstBlock)
      ? firstBlock.getLastChild()
      : null;
    if ($isLineBreakNode(lastChild) && lastInsertedBlock !== firstBlock) {
      lastChild.remove();
    }
  }

  insertParagraph(): ElementNode | null {
    if (this.anchor.key === 'root') {
      const paragraph = $createParagraphNode();
      $getRoot().splice(this.anchor.offset, 0, [paragraph]);
      paragraph.select();
      return paragraph;
    }
    const index = $removeTextAndSplitBlock(this);
    const block = $getAncestor(this.anchor.getNode(), INTERNAL_$isBlock);
    invariant(
      $isElementNode(block),
      'Expected ancestor to be a block ElementNode',
    );
    const firstToAppend = block.getChildAtIndex(index);
    const nodesToInsert = firstToAppend
      ? [firstToAppend, ...firstToAppend.getNextSiblings()]
      : [];
    const newBlock = block.insertNewAfter(this, false) as ElementNode | null;
    if (newBlock) {
      newBlock.append(...nodesToInsert);
      newBlock.selectStart();
      return newBlock;
    }
    return null;
  }

  insertLineBreak(selectStart?: boolean): void {
    const lineBreak = $createLineBreakNode();
    this.insertNodes([lineBreak]);
    if (selectStart) {
      const parent = lineBreak.getParentOrThrow();
      const index = lineBreak.getIndexWithinParent();
      parent.select(index, index);
    }
  }

  extract(): Array<LexicalNode> {
    const selectedNodes = this.getNodes();
    const selectedNodesLength = selectedNodes.length;
    const lastIndex = selectedNodesLength - 1;
    const anchor = this.anchor;
    const focus = this.focus;
    let firstNode = selectedNodes[0];
    let lastNode = selectedNodes[lastIndex];
    const [anchorOffset, focusOffset] = $getCharacterOffsets(this);

    if (selectedNodesLength === 0) {
      return [];
    } else if (selectedNodesLength === 1) {
      if ($isTextNode(firstNode) && !this.isCollapsed()) {
        const startOffset =
          anchorOffset > focusOffset ? focusOffset : anchorOffset;
        const endOffset =
          anchorOffset > focusOffset ? anchorOffset : focusOffset;
        const splitNodes = firstNode.splitText(startOffset, endOffset);
        const node = startOffset === 0 ? splitNodes[0] : splitNodes[1];
        return node != null ? [node] : [];
      }
      return [firstNode];
    }
    const isBefore = anchor.isBefore(focus);

    if ($isTextNode(firstNode)) {
      const startOffset = isBefore ? anchorOffset : focusOffset;
      if (startOffset === firstNode.getTextContentSize()) {
        selectedNodes.shift();
      } else if (startOffset !== 0) {
        [, firstNode] = firstNode.splitText(startOffset);
        selectedNodes[0] = firstNode;
      }
    }
    if ($isTextNode(lastNode)) {
      const lastNodeText = lastNode.getTextContent();
      const lastNodeTextLength = lastNodeText.length;
      const endOffset = isBefore ? focusOffset : anchorOffset;
      if (endOffset === 0) {
        selectedNodes.pop();
      } else if (endOffset !== lastNodeTextLength) {
        [lastNode] = lastNode.splitText(endOffset);
        selectedNodes[lastIndex] = lastNode;
      }
    }
    return selectedNodes;
  }

  modify(
    alter: 'move' | 'extend',
    isBackward: boolean,
    granularity: 'character' | 'word' | 'lineboundary',
  ): void {
    if (
      $modifySelectionAroundDecoratorsAndBlocks(
        this,
        alter,
        isBackward,
        granularity,
      )
    ) {
      return;
    }
    const collapse = alter === 'move';
    const editor = getActiveEditor();
    const domSelection = getDOMSelection(getWindow(editor));

    if (!domSelection) {
      return;
    }
    const blockCursorElement = editor._blockCursorElement;
    const rootElement = editor._rootElement;
    const focusNode = this.focus.getNode();
    if (
      rootElement !== null &&
      blockCursorElement !== null &&
      $isElementNode(focusNode) &&
      !focusNode.isInline() &&
      !focusNode.canBeEmpty()
    ) {
      removeDOMBlockCursorElement(blockCursorElement, editor, rootElement);
    }
    if (this.dirty) {
      let nextAnchorDOM: HTMLElement | Text | null = getElementByKeyOrThrow(
        editor,
        this.anchor.key,
      );
      let nextFocusDOM: HTMLElement | Text | null = getElementByKeyOrThrow(
        editor,
        this.focus.key,
      );
      if (this.anchor.type === 'text') {
        nextAnchorDOM = getDOMTextNode(nextAnchorDOM);
      }
      if (this.focus.type === 'text') {
        nextFocusDOM = getDOMTextNode(nextFocusDOM);
      }
      if (nextAnchorDOM && nextFocusDOM) {
        setDOMSelectionBaseAndExtent( // This function needs to be defined or imported
          domSelection,
          nextAnchorDOM,
          this.anchor.offset,
          nextFocusDOM,
          this.focus.offset,
        );
      }
    }
    moveNativeSelection(
      domSelection,
      alter,
      isBackward ? 'backward' : 'forward',
      granularity,
    );
    if (domSelection.rangeCount > 0) {
      const range = domSelection.getRangeAt(0);
      const anchorNode = this.anchor.getNode();
      const root = $isRootNode(anchorNode)
        ? anchorNode
        : $getNearestRootOrShadowRoot(anchorNode);
      this.applyDOMRange(range);
      this.dirty = true;
      if (!collapse) {
        const nodes = this.getNodes();
        const validNodes = [];
        let shrinkSelection = false;
        for (let i = 0; i < nodes.length; i++) {
          const nextNode = nodes[i];
          if ($hasAncestor(nextNode, root)) {
            validNodes.push(nextNode);
          } else {
            shrinkSelection = true;
          }
        }
        if (shrinkSelection && validNodes.length > 0) {
          if (isBackward) {
            const firstValidNode = validNodes[0];
            if ($isElementNode(firstValidNode)) {
              firstValidNode.selectStart();
            } else {
              firstValidNode.getParentOrThrow().selectStart();
            }
          } else {
            const lastValidNode = validNodes[validNodes.length - 1];
            if ($isElementNode(lastValidNode)) {
              lastValidNode.selectEnd();
            } else {
              lastValidNode.getParentOrThrow().selectEnd();
            }
          }
        }
        if (
          domSelection.anchorNode !== range.startContainer ||
          domSelection.anchorOffset !== range.startOffset
        ) {
          $swapPoints(this);
        }
      }
    }
    if (granularity === 'lineboundary') {
      $modifySelectionAroundDecoratorsAndBlocks(
        this,
        alter,
        isBackward,
        granularity,
        'decorators',
      );
    }
  }

  forwardDeletion(
    anchor: PointType,
    anchorNode: TextNode | ElementNode,
    isBackward: boolean,
  ): boolean {
    if (
      !isBackward &&
      ((anchor.type === 'element' &&
        $isElementNode(anchorNode) &&
        anchor.offset === anchorNode.getChildrenSize()) ||
        (anchor.type === 'text' &&
          anchor.offset === anchorNode.getTextContentSize()))
    ) {
      const parent = anchorNode.getParent();
      const nextSibling =
        anchorNode.getNextSibling() ||
        (parent === null ? null : parent.getNextSibling());

      if ($isElementNode(nextSibling) && nextSibling.isShadowRoot()) {
        return true;
      }
    }
    return false;
  }

  deleteCharacter(isBackward: boolean): void {
    const wasCollapsed = this.isCollapsed();
    if (this.isCollapsed()) {
      const anchor = this.anchor;
      let anchorNode: TextNode | ElementNode | null = anchor.getNode() as (TextNode | ElementNode | null);
      if (this.forwardDeletion(anchor, anchorNode!, isBackward)) {
        return;
      }
      const direction = isBackward ? 'previous' : 'next';
      const initialCaret = $caretFromPoint(anchor, direction);
      const initialRange = $extendCaretToRange(initialCaret);
      if (
        initialRange
          .getTextSlices()
          .every((slice) => slice === null || slice.distance === 0)
      ) {
        let state:
          | { type: 'initial' }
          | {
            type: 'merge-next-block';
            block: ElementNode;
          }
          | {
            type: 'merge-block';
            caret: ChildCaret<ElementNode, typeof direction>;
            block: ElementNode;
          } = { type: 'initial' };
        for (const caret of initialRange.iterNodeCarets('shadowRoot')) {
          if ($isChildCaret(caret)) {
            if (caret.origin.isInline()) {
              // fall through
            } else if (caret.origin.isShadowRoot()) {
              if (state.type === 'merge-block') {
                break;
              }
              if (
                $isElementNode(initialRange.anchor.origin) &&
                initialRange.anchor.origin.isEmpty()
              ) {
                const normCaret = $normalizeCaret(caret);
                $updateRangeSelectionFromCaretRange(
                  this,
                  $getCaretRange(normCaret, normCaret),
                );
                initialRange.anchor.origin.remove();
              }
              return;
            } else if (
              state.type === 'merge-next-block' ||
              state.type === 'merge-block'
            ) {
              state = { block: state.block, caret, type: 'merge-block' };
            }
          } else if (state.type === 'merge-block') {
            break;
          } else if ($isSiblingCaret(caret)) {
            if ($isElementNode(caret.origin)) {
              if (!caret.origin.isInline()) {
                state = { block: caret.origin, type: 'merge-next-block' };
              } else if (!caret.origin.isParentOf(initialRange.anchor.origin)) {
                break;
              }
              continue;
            } else if ($isDecoratorNode(caret.origin)) {
              if (caret.origin.isIsolated()) {
                // do nothing
              } else if (
                state.type === 'merge-next-block' &&
                (caret.origin.isKeyboardSelectable() ||
                  !caret.origin.isInline()) &&
                $isElementNode(initialRange.anchor.origin) &&
                initialRange.anchor.origin.isEmpty()
              ) {
                initialRange.anchor.origin.remove();
                const nodeSelection = $createNodeSelection();
                nodeSelection.add(caret.origin.getKey());
                $setSelectionHelper(nodeSelection);
              } else {
                caret.origin.remove();
              }
              return;
            }
            break;
          }
        }
        if (state.type === 'merge-block') {
          const { caret, block } = state;
          $updateRangeSelectionFromCaretRange(
            this,
            $getCaretRange(
              !caret.origin.isEmpty() && block.isEmpty()
                ? $rewindSiblingCaret($getSiblingCaret(block, caret.direction))
                : initialRange.anchor,
              caret,
            ),
          );
          return this.removeText();
        }
      }

      const focus = this.focus;
      this.modify('extend', isBackward, 'character');

      if (!this.isCollapsed()) {
        const focusNode = focus.type === 'text' ? focus.getNode() : null;
        anchorNode = anchor.type === 'text' ? anchor.getNode() as TextNode : null;

        if (focusNode !== null && ($isTextNode(focusNode) && focusNode.isSegmented())) {
          const offset = focus.offset;
          const textContentSize = focusNode.getTextContentSize();
          if (
            focusNode.is(anchorNode) ||
            (isBackward && offset !== textContentSize) ||
            (!isBackward && offset !== 0)
          ) {
            $removeSegment(focusNode as TextNode, isBackward, offset);
            return;
          }
        } else if (anchorNode !== null && anchorNode.isSegmented()) {
          const offset = anchor.offset;
          const textContentSize = anchorNode.getTextContentSize();
          if (
            anchorNode.is(focusNode) ||
            (isBackward && offset !== 0) ||
            (!isBackward && offset !== textContentSize)
          ) {
            $removeSegment(anchorNode, isBackward, offset);
            return;
          }
        }
         $updateCaretSelectionForUnicodeCharacter(this, isBackward);
      } else if (isBackward && anchor.offset === 0) {
        if ($collapseAtStart(this, anchor.getNode())) {
          return;
        }
      }
    }
    this.removeText();
    if (
      isBackward &&
      !wasCollapsed &&
      this.isCollapsed() &&
      this.anchor.type === 'element' &&
      this.anchor.offset === 0
    ) {
      const anchorNode = this.anchor.getNode();
      if (
        anchorNode.isEmpty() &&
        $isRootNode(anchorNode.getParent()) &&
        anchorNode.getPreviousSibling() === null
      ) {
        $collapseAtStart(this, anchorNode);
      }
    }
  }

  deleteLine(isBackward: boolean): void {
    if (this.isCollapsed()) {
      this.modify('extend', isBackward, 'lineboundary');
    }
    if (this.isCollapsed()) {
      this.deleteCharacter(isBackward);
    } else {
      this.removeText();
    }
  }

  deleteWord(isBackward: boolean): void {
    if (this.isCollapsed()) {
      const anchor = this.anchor;
      const anchorNode: TextNode | ElementNode | null = anchor.getNode() as (TextNode | ElementNode | null);
      if (this.forwardDeletion(anchor, anchorNode!, isBackward)) {
        return;
      }
      this.modify('extend', isBackward, 'word');
    }
    this.removeText();
  }

  isBackward(): boolean {
    return this.focus.isBefore(this.anchor);
  }

  getStartEndPoints(): null | [PointType, PointType] {
    return [this.anchor, this.focus];
  }
}

export function $isNodeSelection(x: unknown): x is NodeSelection {
  return x instanceof NodeSelection;
}

function getCharacterOffset(point: PointType): number {
  const offset = point.offset;
  if (point.type === 'text') {
    return offset;
  }
  const parent = point.getNode();
  return offset === parent.getChildrenSize()
    ? parent.getTextContent().length
    : 0;
}

export function $getCharacterOffsets(
  selection: BaseSelection,
): [number, number] {
  const anchorAndFocus = selection.getStartEndPoints();
  if (anchorAndFocus === null) {
    return [0, 0];
  }
  const [anchor, focus] = anchorAndFocus;
  if (
    anchor.type === 'element' &&
    focus.type === 'element' &&
    anchor.key === focus.key &&
    anchor.offset === focus.offset
  ) {
    return [0, 0];
  }
  return [getCharacterOffset(anchor), getCharacterOffset(focus)];
}

function $collapseAtStart(
  selection: RangeSelection,
  startNode: LexicalNode,
): boolean {
  for (
    let node: null | LexicalNode = startNode;
    node;
    node = node.getParent()
  ) {
    if ($isElementNode(node)) {
      if (node.collapseAtStart(selection)) {
        return true;
      }
      if ($isRootOrShadowRoot(node)) {
        break;
      }
    }
    if (node.getPreviousSibling()) {
      break;
    }
  }
  return false;
}

function $swapPoints(selection: RangeSelection): void {
  const focus = selection.focus;
  const anchor = selection.anchor;
  const anchorKey = anchor.key;
  const anchorOffset = anchor.offset;
  const anchorType = anchor.type;

  anchor.set(focus.key, focus.offset, focus.type, true);
  focus.set(anchorKey, anchorOffset, anchorType, true);
}

function moveNativeSelection( // This function needs to be defined
  domSelection: Selection,
  alter: 'move' | 'extend',
  direction: 'backward' | 'forward' | 'left' | 'right',
  granularity: 'character' | 'word' | 'lineboundary',
): void {
  domSelection.modify(alter, direction, granularity);
}

function setDOMSelectionBaseAndExtent( // This function needs to be defined
  domSelection: Selection,
  nextAnchorDOM: HTMLElement | Text,
  nextAnchorOffset: number,
  nextFocusDOM: HTMLElement | Text,
  nextFocusOffset: number,
): void {
  try {
    domSelection.setBaseAndExtent(
      nextAnchorDOM,
      nextAnchorOffset,
      nextFocusDOM,
      nextFocusOffset,
    );
  } catch (error) {
    if (__DEV__) {
      console.warn(error);
    }
  }
}

// This function was defined inside updateDOMSelection, moving it out to be callable
// by other selection logic if needed, or keep it local to updateDOMSelection.
// For now, keeping it local to where it was (inside the conceptual LexicalSelection.ts block).
function setDOMSelectionBaseAndExtentLocal(
  domSelection: Selection,
  nextAnchorDOM: HTMLElement | Text,
  nextAnchorOffset: number,
  nextFocusDOM: HTMLElement | Text,
  nextFocusOffset: number,
): void {
  try {
    domSelection.setBaseAndExtent(
      nextAnchorDOM,
      nextAnchorOffset,
      nextFocusDOM,
      nextFocusOffset,
    );
  } catch (error) {
    if (__DEV__) {
      console.warn(error);
    }
  }
}


export function updateDOMSelection(
  prevSelection: BaseSelection | null,
  nextSelection: BaseSelection | null,
  editor: LexicalEditor,
  domSelection: Selection,
  tags: Set<string>,
  rootElement: HTMLElement,
  nodeCount: number,
): void {
  const anchorDOMNode = domSelection.anchorNode;
  const focusDOMNode = domSelection.focusNode;
  const anchorOffset = domSelection.anchorOffset;
  const focusOffset = domSelection.focusOffset;
  const activeElement = document.activeElement;

  if (
    (tags.has(COLLABORATION_TAG) && activeElement !== rootElement) ||
    (activeElement !== null &&
      isSelectionCapturedInDecoratorInput(activeElement))
  ) {
    return;
  }

  if (!$isRangeSelection(nextSelection)) {
    if (
      prevSelection !== null &&
      isSelectionWithinEditor(editor, anchorDOMNode, focusDOMNode)
    ) {
      domSelection.removeAllRanges();
    }
    return;
  }

  const anchor = nextSelection.anchor;
  const focus = nextSelection.focus;
  const anchorKey = anchor.key;
  const focusKey = focus.key;
  const anchorDOM = getElementByKeyOrThrow(editor, anchorKey);
  const focusDOM = getElementByKeyOrThrow(editor, focusKey);
  const nextAnchorOffset = anchor.offset;
  const nextFocusOffset = focus.offset;
  const nextFormat = nextSelection.format;
  const nextStyle = nextSelection.style;
  const isCollapsed = nextSelection.isCollapsed();
  let nextAnchorNode: HTMLElement | Text | null = anchorDOM;
  let nextFocusNode: HTMLElement | Text | null = focusDOM;
  let anchorFormatOrStyleChanged = false;

  if (anchor.type === 'text') {
    nextAnchorNode = getDOMTextNode(anchorDOM);
    const anchorNode = anchor.getNode() as TextNode;
    anchorFormatOrStyleChanged =
      anchorNode.getFormat() !== nextFormat ||
      anchorNode.getStyle() !== nextStyle;
  } else if (
    $isRangeSelection(prevSelection) &&
    prevSelection.anchor.type === 'text'
  ) {
    anchorFormatOrStyleChanged = true;
  }

  if (focus.type === 'text') {
    nextFocusNode = getDOMTextNode(focusDOM);
  }

  if (nextAnchorNode === null || nextFocusNode === null) {
    return;
  }

  if (
    isCollapsed &&
    (prevSelection === null ||
      anchorFormatOrStyleChanged ||
      ($isRangeSelection(prevSelection) &&
        (prevSelection.format !== nextFormat ||
          prevSelection.style !== nextStyle)))
  ) {
    markCollapsedSelectionFormat(
      nextFormat,
      nextStyle,
      nextAnchorOffset,
      anchorKey,
      performance.now(),
    );
  }

  if (
    anchorOffset === nextAnchorOffset &&
    focusOffset === nextFocusOffset &&
    anchorDOMNode === nextAnchorNode &&
    focusDOMNode === nextFocusNode &&
    !(domSelection.type === 'Range' && isCollapsed)
  ) {
    if (activeElement === null || !rootElement.contains(activeElement)) {
      rootElement.focus({
        preventScroll: true,
      });
    }
    if (anchor.type !== 'element') {
      return;
    }
  }

  setDOMSelectionBaseAndExtentLocal(
    domSelection,
    nextAnchorNode,
    nextAnchorOffset,
    nextFocusNode,
    nextFocusOffset,
  );

  if (
    !tags.has(SKIP_SCROLL_INTO_VIEW_TAG) &&
    nextSelection.isCollapsed() &&
    rootElement !== null &&
    rootElement === document.activeElement
  ) {
    const selectionTarget: null | Range | HTMLElement | Text =
      $isRangeSelection(nextSelection) &&
        nextSelection.anchor.type === 'element'
        ? (nextAnchorNode.childNodes[nextAnchorOffset] as HTMLElement | Text) ||
        null
        : domSelection.rangeCount > 0
          ? domSelection.getRangeAt(0)
          : null;
    if (selectionTarget !== null) {
      let selectionRect: DOMRect;
      if (selectionTarget instanceof Text) {
        const range = document.createRange();
        range.selectNode(selectionTarget);
        selectionRect = range.getBoundingClientRect();
      } else {
        selectionRect = selectionTarget.getBoundingClientRect();
      }
      scrollIntoViewIfNeeded(editor, selectionRect, rootElement);
    }
  }
  markSelectionChangeFromDOMUpdate();
}


export function $insertNodes(nodes: Array<LexicalNode>):void {
  let selection = $getSelection() || $getPreviousSelection();

  if (selection === null) {
    selection = $getRoot().selectEnd();
  }
  selection.insertNodes(nodes);
}

export function $getTextContent(): string {
  const selection = $getSelection();
  if (selection === null) {
    return '';
  }
  return selection.getTextContent();
}

function $removeTextAndSplitBlock(selection: RangeSelection): number {
  let selection_ = selection;
  if (!selection.isCollapsed()) {
    selection_.removeText();
  }
  const newSelection = $getSelection();
  if ($isRangeSelection(newSelection)) {
    selection_ = newSelection;
  }

  invariant(
    $isRangeSelection(selection_),
    'Unexpected dirty selection to be null',
  );

  const anchor = selection_.anchor;
  let node = anchor.getNode();
  let offset = anchor.offset;

  while (!INTERNAL_$isBlock(node)) {
    const prevNode = node;
    [node, offset] = $splitNodeAtPoint(node, offset);
    if (prevNode.is(node)) {
      break;
    }
  }
  return offset;
}

function $splitNodeAtPoint(
  node: LexicalNode,
  offset: number,
): [parent: ElementNode, offset: number] {
  const parent = node.getParent();
  if (!parent) {
    const paragraph = $createParagraphNode();
    $getRoot().append(paragraph);
    paragraph.select();
    return [$getRoot(), 0];
  }

  if ($isTextNode(node)) {
    const split = node.splitText(offset);
    if (split.length === 0) {
      return [parent, node.getIndexWithinParent()];
    }
    const x = offset === 0 ? 0 : 1;
    const index = split[0].getIndexWithinParent() + x;
    return [parent, index];
  }

  if (!$isElementNode(node) || offset === 0) {
    return [parent, node.getIndexWithinParent()];
  }

  const firstToAppend = node.getChildAtIndex(offset);
  if (firstToAppend) {
    const insertPoint = new RangeSelection(
      $createPoint(node.getKey(), offset, 'element'),
      $createPoint(node.getKey(), offset, 'element'),
      0,
      '',
    );
    const newElement = node.insertNewAfter(insertPoint) as ElementNode | null;
    if (newElement) {
      newElement.append(firstToAppend, ...firstToAppend.getNextSiblings());
    }
  }
  return [parent, node.getIndexWithinParent() + 1];
}

function $wrapInlineNodes(nodes: LexicalNode[]): ElementNode {
  const virtualRoot = $createParagraphNode();
  let currentBlock: ElementNode | null = null;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLineBreakNode = $isLineBreakNode(node);

    if (
      isLineBreakNode ||
      ($isDecoratorNode(node) && node.isInline()) ||
      ($isElementNode(node) && node.isInline()) ||
      $isTextNode(node) ||
      node.isParentRequired()
    ) {
      if (currentBlock === null) {
        currentBlock = node.createParentElementNode();
        virtualRoot.append(currentBlock);
        if (isLineBreakNode) {
          continue;
        }
      }
      if (currentBlock !== null) {
        currentBlock.append(node);
      }
    } else {
      virtualRoot.append(node);
      currentBlock = null;
    }
  }
  return virtualRoot;
}

function $getNodesFromCaretRangeCompat(
  range: CaretRange<'next'>,
): LexicalNode[] {
  const nodes: LexicalNode[] = [];
  const [beforeSlice, afterSlice] = range.getTextSlices();
  if (beforeSlice) {
    nodes.push(beforeSlice.caret.origin);
  }
  const seenAncestors = new Set<ElementNode>();
  const seenElements = new Set<ElementNode>();
  for (const caret of range) {
    if ($isChildCaret(caret)) {
      const { origin } = caret;
      if (nodes.length === 0) {
        seenAncestors.add(origin);
      } else {
        seenElements.add(origin);
        nodes.push(origin);
      }
    } else {
      const { origin } = caret;
      if (!$isElementNode(origin) || !seenElements.has(origin)) {
        nodes.push(origin);
      }
    }
  }
  if (afterSlice) {
    nodes.push(afterSlice.caret.origin);
  }
  if (
    $isSiblingCaret(range.focus) &&
    $isElementNode(range.focus.origin) &&
    range.focus.getNodeAtCaret() === null
  ) {
    for (
      let reverseCaret: null | NodeCaret<'previous'> = $getChildCaret(
        range.focus.origin,
        'previous',
      );
      $isChildCaret(reverseCaret) &&
      seenAncestors.has(reverseCaret.origin) &&
      !reverseCaret.origin.isEmpty() &&
      reverseCaret.origin.is(nodes[nodes.length - 1]);
      reverseCaret = $getAdjacentChildCaret(reverseCaret)
    ) {
      seenAncestors.delete(reverseCaret.origin);
      nodes.pop();
    }
  }
  while (nodes.length > 1) {
    const lastIncludedNode = nodes[nodes.length - 1];
    if ($isElementNode(lastIncludedNode)) {
      if (
        seenElements.has(lastIncludedNode) ||
        lastIncludedNode.isEmpty() ||
        seenAncestors.has(lastIncludedNode)
      ) {
        // fall through
      } else {
        nodes.pop();
        continue;
      }
    }
    break;
  }
  if (nodes.length === 0 && range.isCollapsed()) {
    const normCaret = $normalizeCaret(range.anchor);
    const flippedNormCaret = $normalizeCaret(range.anchor.getFlipped());
    const $getCandidate = (caret: PointCaret): LexicalNode | null =>
      $isTextPointCaret(caret) ? caret.origin : caret.getNodeAtCaret();
    const node =
      $getCandidate(normCaret) ||
      $getCandidate(flippedNormCaret) ||
      (range.anchor.getNodeAtCaret()
        ? normCaret.origin
        : flippedNormCaret.origin);
    if (node) nodes.push(node);
  }
  return nodes;
}

function $modifySelectionAroundDecoratorsAndBlocks(
  selection: RangeSelection,
  alter: 'move' | 'extend',
  isBackward: boolean,
  granularity: 'character' | 'word' | 'lineboundary',
  mode: 'decorators-and-blocks' | 'decorators' = 'decorators-and-blocks',
): boolean {
  if (
    alter === 'move' &&
    granularity === 'character' &&
    !selection.isCollapsed()
  ) {
    const [src, dst] =
      isBackward === selection.isBackward()
        ? [selection.focus, selection.anchor]
        : [selection.anchor, selection.focus];
    dst.set(src.key, src.offset, src.type);
    return true;
  }
  const initialFocus = $caretFromPoint(
    selection.focus,
    isBackward ? 'previous' : 'next',
  );
  const isLineBoundary = granularity === 'lineboundary';
  const collapse = alter === 'move';
  let focus = initialFocus;
  let checkForBlock = mode === 'decorators-and-blocks';
  if (!$isExtendableTextPointCaret(focus) && initialFocus[Symbol.iterator]) { // Check if initialFocus is iterable
    for (const siblingCaret of initialFocus as Iterable<SiblingCaret<LexicalNode, 'previous' | 'next'>>) { // Cast to iterable
      checkForBlock = false;
      const { origin } = siblingCaret;
      if ($isDecoratorNode(origin) && !origin.isIsolated()) {
        focus = siblingCaret;
        if (isLineBoundary && origin.isInline()) {
          continue;
        }
      }
      break;
    }
    if (checkForBlock) {
      for (const nextCaret of $extendCaretToRange(initialFocus).iterNodeCarets(
        alter === 'extend' ? 'shadowRoot' : 'root',
      )) {
        if ($isChildCaret(nextCaret)) {
          if (!nextCaret.origin.isInline()) {
            focus = nextCaret;
          }
        } else if ($isElementNode(nextCaret.origin)) {
          continue;
        } else if (
          $isDecoratorNode(nextCaret.origin) &&
          !nextCaret.origin.isInline()
        ) {
          focus = nextCaret;
        }
        break;
      }
    }
  }
  if (focus === initialFocus) {
    return false;
  }
  if (
    collapse &&
    !isLineBoundary &&
    $isDecoratorNode(focus.origin) &&
    focus.origin.isKeyboardSelectable()
  ) {
    const nodeSelection = $createNodeSelection();
    nodeSelection.add(focus.origin.getKey());
    $setSelectionHelper(nodeSelection);
    return true;
  }
  focus = $normalizeCaret(focus);
  if (collapse) {
    $setPointFromCaret(selection.anchor, focus);
  }
  $setPointFromCaret(selection.focus, focus);
  return checkForBlock || !isLineBoundary;
}

function $updateCaretSelectionForUnicodeCharacter(
  selection: RangeSelection,
  isBackward: boolean,
): void {
    const anchor = selection.anchor;
    const focus = selection.focus;
    const anchorNode = anchor.getNode();
    const focusNode = focus.getNode();

    if (
        anchorNode === focusNode &&
        anchor.type === 'text' &&
        focus.type === 'text'
    ) {
        const anchorOffset = anchor.offset;
        const focusOffset = focus.offset;
        const isBefore = anchorOffset < focusOffset;
        const startOffset = isBefore ? anchorOffset : focusOffset;
        const endOffset = isBefore ? focusOffset : anchorOffset;
        const characterOffset = endOffset - 1;

        if (startOffset !== characterOffset) {
            const text = (anchorNode as TextNode).getTextContent().slice(startOffset, endOffset);
            // Simplified shouldDeleteExactlyOneCodeUnit check for now
            if (text.length > 1 && !doesContainSurrogatePair(text)) {
                if (isBackward) {
                    focus.set(focus.key, characterOffset, focus.type);
                } else {
                    anchor.set(anchor.key, characterOffset, anchor.type);
                }
            }
        }
    }
}
