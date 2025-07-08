/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import invariant from 'shared/invariant';
import type { LexicalNode, NodeKey } from './LexicalNode';
// EditorState might not be directly needed if getActiveEditorState returns it and it's used locally
// import type { EditorState } from './LexicalEditorState';
import { getActiveEditorState, isCurrentlyReadOnlyMode, getActiveEditor } from './LexicalUpdates'; // Added getActiveEditor
import { Point as PointClass, NodeSelection as NodeSelectionClass, RangeSelection as RangeSelectionClass, $isRangeSelection } from './LexicalSelection'; // Import necessary types/guards
import { $isTextNode, $isElementNode } from './LexicalNodeChecks'; // Type guards from central location
import { $getCompositionKey, $setCompositionKey, toggleTextFormatType } from './LexicalUtils'; // Import for composition keys & toggleTextFormatType
// invariant is already imported at the top
import type { TextNode, TextFormatType } from './nodes/LexicalTextNode'; // For formatText augmentations

// Augment Point
declare module './LexicalSelection' {
  interface Point {
    getNode(): LexicalNode;
    set(key: NodeKey, offset: number, type: 'text' | 'element', onlyIfChanged?: boolean): void;
  }
  // Augment RangeSelection
  interface RangeSelection {
    toggleFormat(format: TextFormatType): void;
    formatText(formatType: TextFormatType, alignWithFormat?: number | null): void;
  }
}

PointClass.prototype.getNode = function(): LexicalNode {
  const key = this.key;
  const editorState = getActiveEditorState();
  const node = editorState._nodeMap.get(key) as LexicalNode | undefined;
  if (node === undefined) {
    invariant(false, 'Point.getNode: node not found');
  }
  return node;
};

PointClass.prototype.set = function(key: NodeKey, offset: number, type: 'text' | 'element', onlyIfChanged?: boolean): void {
  const selection = this._selection; // this._selection is part of Point's own properties
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
    const editorState = getActiveEditorState(); // from LexicalUpdates
    const node = editorState._nodeMap.get(key) as LexicalNode | undefined;
    invariant(
      type === 'text' ? $isTextNode(node) : $isElementNode(node), // $isTextNode, $isElementNode from LexicalSelection
      'PointType.set: node with key %s is %s and can not be used for a %s point',
      key,
      node ? node.__type : '[not found]',
      type,
    );
  }
  if (!isCurrentlyReadOnlyMode()) { // from LexicalUpdates
    if ($getCompositionKey() === oldKey) { // from LexicalUtils
      $setCompositionKey(key); // from LexicalUtils
    }
    if (selection !== null) {
      selection.setCachedNodes(null);
      selection.dirty = true;
    }
  }
};

// Augment NodeSelection
declare module './LexicalSelection' {
  interface NodeSelection {
    getNodes(): Array<LexicalNode>;
  }
}

NodeSelectionClass.prototype.getNodes = function(): Array<LexicalNode> {
  const cachedNodes = this._cachedNodes;
  if (cachedNodes !== null) {
    return cachedNodes;
  }
  const editorState = getActiveEditorState();
  const objects = this._nodes;
  const nodes = [];
  for (const object of objects) {
    const node = editorState._nodeMap.get(object) as LexicalNode | undefined;
    if (node !== undefined) {
      nodes.push(node);
    }
  }
  if (!isCurrentlyReadOnlyMode()) {
    this._cachedNodes = nodes;
  }
  return nodes;
};

RangeSelectionClass.prototype.toggleFormat = function(formatType: TextFormatType): void {
  // This implementation is taken from LexicalSelection.ts RangeSelection.toggleFormat
  // It uses toggleTextFormatType (from LexicalUtils) and this.format / this.dirty (own properties)
  this.format = toggleTextFormatType(this.format, formatType, null);
  this.dirty = true;
};

RangeSelectionClass.prototype.formatText = function(formatType: TextFormatType, alignWithFormat: number | null = null): void {
  // This implementation is taken from LexicalSelection.ts RangeSelection.formatText
  // It's complex and uses many internal things.
  // For now, ensure it calls the now-augmented this.toggleFormat and $setCompositionKey.
  // Other calls like this.getNodes() will use augmented versions if available on BaseSelection/NodeSelection.
  // Calls to node.setFormat() on TextNode instances will use the original TextNode.setFormat (which uses getWritable).

  if (this.isCollapsed()) {
    this.toggleFormat(formatType); // Uses augmented toggleFormat
    $setCompositionKey(null); // From LexicalUtils -> LexicalUpdates
    return;
  }

  const selectedNodes = this.getNodes(); // Uses augmented NodeSelection.getNodes
  const selectedTextNodes: Array<TextNode> = [];
  for (const selectedNode of selectedNodes) {
    if ($isTextNode(selectedNode)) { // $isTextNode from LexicalNodeChecks
      selectedTextNodes.push(selectedNode);
    }
  }
  const applyFormatToElements = (alignWith: number | null) => {
    selectedNodes.forEach((node) => {
      if ($isElementNode(node)) { // $isElementNode from LexicalNodeChecks
        const newFormat = node.getFormatFlags(formatType, alignWith); // ElementNode method
        node.setTextFormat(newFormat); // ElementNode method
      }
    });
  };

  const selectedTextNodesLength = selectedTextNodes.length;
  if (selectedTextNodesLength === 0) {
    this.toggleFormat(formatType); // Uses augmented toggleFormat
    $setCompositionKey(null); // From LexicalUtils -> LexicalUpdates
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
    startOffset === firstNode.getTextContentSize() && // TextNode method
    selectedTextNodes[1] !== undefined // Check if there is a next node
  ) {
    firstIndex = 1;
    firstNode = selectedTextNodes[firstIndex];
    startOffset = 0;
  }

  if (firstNode == null) {
    return;
  }

  // getFormatFlags is a TextNode method
  const firstNextFormat = firstNode.getFormatFlags(
    formatType,
    alignWithFormat,
  );
  applyFormatToElements(firstNextFormat);

  const lastIndex = selectedTextNodesLength - 1;
  let lastNode = selectedTextNodes[lastIndex];
  // getTextContentSize is a TextNode method
  const endOffset =
    endPoint.type === 'text'
      ? endPoint.offset
      : lastNode.getTextContentSize();

  if (firstNode.is(lastNode)) {
    if (startOffset === endOffset) {
      return;
    }
    // $isTokenOrSegmented from LexicalUtils
    // getTextContentSize, setFormat, splitText are TextNode methods
    if (
      ($getCompositionKey() !== null && firstNode.isSegmented()) || // A bit of a guess for $isTokenOrSegmented equivalent here
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

  if (startOffset !== 0 && !($getCompositionKey() !== null && firstNode.isSegmented())) {
    [, firstNode] = firstNode.splitText(startOffset);
    startOffset = 0;
  }
  firstNode.setFormat(firstNextFormat); // TextNode method

  const lastNextFormat = lastNode.getFormatFlags(formatType, firstNextFormat); // TextNode method
  if (endOffset > 0) {
    if (
      endOffset !== lastNode.getTextContentSize() && !($getCompositionKey() !== null && lastNode.isSegmented())
    ) {
      [lastNode] = lastNode.splitText(endOffset);
    }
    lastNode.setFormat(lastNextFormat); // TextNode method
  }

  for (let i = firstIndex + 1; i < lastIndex; i++) {
    const textNode = selectedTextNodes[i];
    const nextFormat = textNode.getFormatFlags(formatType, lastNextFormat); // TextNode method
    textNode.setFormat(nextFormat); // TextNode method
  }

  if (startPoint.type === 'text') {
    startPoint.set(firstNode.getKey(), startOffset, 'text');
  }
  if (endPoint.type === 'text') {
    endPoint.set(lastNode.getKey(), endOffset, 'text');
  }
  this.format = firstNextFormat | lastNextFormat;
};
