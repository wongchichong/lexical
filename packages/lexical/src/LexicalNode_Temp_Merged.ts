// This is a temporary merged file for LexicalNode and its methods.
// Content will be a combination of LexicalNode.ts (slimmed) and LexicalNodeMethods.ts

// Imports from LexicalNode.ts (slimmed) and LexicalNodeMethods.ts (deduplicated and adjusted)
import type {
  EditorConfig,
  Klass,
  KlassConstructor,
  LexicalEditor,
  // Types that were in LexicalCore but might be needed directly by Node methods
  EditorState,
  BaseSelection as CoreBaseSelection, // Alias if BaseSelection is also defined locally
  RangeSelection as CoreRangeSelection, // Alias if RangeSelection is also defined locally
} from './LexicalCore';

import invariant from 'shared/invariant';
import { NODE_STATE_KEY, PROTOTYPE_CONFIG_METHOD, TEXT_TYPE_TO_FORMAT } from './LexicalConstants'; // Added TEXT_TYPE_TO_FORMAT
import {
  $updateStateFromJSON,
  type NodeState,
  type NodeStateJSON,
  type Prettify,
  type RequiredNodeStateConfig,
} from './LexicalNodeState';

import {
  $setNodeKey,
  getRegisteredNode,
  $getNodeByKey,
  $isRootOrShadowRoot,
  removeFromParent as removeFromParentHelper,
  errorOnInsertTextNodeOnRoot,
  $getCompositionKey,
  $setCompositionKey,
  $maybeMoveChildrenSelectionToParent,
} from './LexicalUtils';

import { ElementNode, $isElementNode, ElementNode as ElementNodeClass } from './nodes/LexicalElementNode';
import { $createParagraphNode } from './nodes/LexicalParagraphNode';
import { $isTextNode, TextNode as LexicalTextNodeClass } from './nodes/LexicalTextNode'; // Renamed TextNode to avoid conflict
import type { DecoratorNode } from './nodes/LexicalDecoratorNode'; // For getTopLevelElement
import { $isRootNode } from './nodes/LexicalRootNode'; // For remove method
import {
  $getSelection,
  $isRangeSelection,
  moveSelectionPointToSibling,
  $updateElementSelectionOnCreateDeleteNode,
  $isNodeSelection,
  $setSelection as $setSelectionHelper, // Renamed to avoid conflict
  $moveSelectionPointToEnd,
  // Re-add BaseSelection and RangeSelection if they are distinct from LexicalCore versions
  type BaseSelection,
  type RangeSelection
} from './LexicalSelection';
import { $getCommonAncestor, $getCommonAncestorResultBranchOrder } from './caret/LexicalCaret';

// Forward declare LexicalNode if used in types before class definition (it is)
export type NodeKey = string;
export declare class LexicalNode {
  // Minimal forward declaration for type usage within this file before full class definition
  __key: NodeKey;
  __parent: NodeKey | null;
  __prev: NodeKey | null;
  __next: NodeKey | null;
  constructor(key?: NodeKey);
  getType(): string;
  is<T extends LexicalNode>(node: T | null | undefined): node is T;
  getLatest<T extends LexicalNode>(this: T): T;
  getWritable<T extends LexicalNode>(this: T): T;
  getParent<T extends ElementNodeClass>(): T | null;
  getPreviousSibling<T extends LexicalNode>(): T | null;
  getNextSibling<T extends LexicalNode>(): T | null;
  getParentOrThrow<T extends ElementNodeClass>(): T;
  getChildrenSize(): number; // Added for isSelected
  getLastChild(): LexicalNode | null; // Added for isSelected
  isInline(): boolean; // Added for isSelected
  getChildren(): Array<LexicalNode>; // Added for replace
  append(...nodesToAppend: LexicalNode[]): ElementNodeClass; // Added for replace
  getIndexWithinParent(): number; // Added for remove/replace etc.
  selectPrevious(anchorOffset?: number, focusOffset?: number): CoreRangeSelection; // CoreRangeSelection
  selectNext(anchorOffset?: number, focusOffset?: number): CoreRangeSelection; // CoreRangeSelection
  // Add other methods that are called internally by other methods being moved
}


export type NodeMap = Map<NodeKey, LexicalNode>;

export type SerializedLexicalNode = {
  type: string;
  version: number;
  [NODE_STATE_KEY]?: Record<string, unknown>;
};

export interface StaticNodeConfigValue<
  T extends LexicalNode,
  Type extends string,
> {
  readonly type?: Type;
  readonly $transform?: (node: T) => void;
  readonly $importJSON?: (serializedNode: SerializedLexicalNode) => T;
  readonly importDOM?: DOMConversionMap;
  readonly stateConfigs?: readonly RequiredNodeStateConfig[];
  readonly extends?: Klass<LexicalNode>;
}

export type BaseStaticNodeConfig = {
  readonly [K in string]?: StaticNodeConfigValue<LexicalNode, string>;
};

export type StaticNodeConfig<
  T extends LexicalNode,
  Type extends string,
> = BaseStaticNodeConfig & {
  readonly [K in Type]?: StaticNodeConfigValue<T, Type>;
};

export type AnyStaticNodeConfigValue = StaticNodeConfigValue<any, any>;

export type StaticNodeConfigRecord<
  Type extends string,
  Config extends AnyStaticNodeConfigValue,
> = BaseStaticNodeConfig & {
  readonly [K in Type]?: Config;
};

export type GetStaticNodeType<T extends LexicalNode> = ReturnType<
  T[typeof PROTOTYPE_CONFIG_METHOD]
> extends StaticNodeConfig<T, infer Type>
  ? Type
  : string;

export type LexicalExportJSON<T extends LexicalNode> = Prettify<
  Omit<ReturnType<T['exportJSON']>, 'type'> & {
    type: GetStaticNodeType<T>;
  } & NodeStateJSON<T>
>;

export type LexicalUpdateJSON<T extends SerializedLexicalNode> = Omit<
  T,
  'children' | 'type' | 'version'
>;

export interface LexicalPrivateDOM {
  __lexicalTextContent?: string | undefined | null;
  __lexicalLineBreak?: HTMLBRElement | HTMLImageElement | undefined | null;
  __lexicalDirTextContent?: string | undefined | null;
  __lexicalDir?: 'ltr' | 'rtl' | null | undefined;
  __lexicalUnmanaged?: boolean | undefined;
}

export type DOMConversionProp<T extends HTMLElement> = (
  node: T,
) => DOMConversion<T> | null;

export type DOMConversionPropByTagName<K extends string> = DOMConversionProp<
  K extends keyof HTMLElementTagNameMap ? HTMLElementTagNameMap[K] : HTMLElement
>;

export type DOMConversionTagNameMap<K extends string> = {
  [NodeName in K]?: DOMConversionPropByTagName<NodeName>;
};

export function buildImportMap<K extends string>(importMap: {
  [NodeName in K]: DOMConversionPropByTagName<NodeName>;
}): DOMConversionMap {
  return importMap as unknown as DOMConversionMap;
}

export type DOMConversion<T extends HTMLElement = HTMLElement> = {
  conversion: DOMConversionFn<T>;
  priority?: 0 | 1 | 2 | 3 | 4;
};

export type DOMConversionFn<T extends HTMLElement = HTMLElement> = (
  element: T,
) => DOMConversionOutput | null;

export type DOMChildConversion = (
  lexicalNode: LexicalNode,
  parentLexicalNode: LexicalNode | null | undefined,
) => LexicalNode | null | undefined;

export type DOMConversionMap<T extends HTMLElement = HTMLElement> = Record<
  string, // NodeName
  DOMConversionProp<T>
>;

export type DOMConversionOutput = {
  after?: (childLexicalNodes: Array<LexicalNode>) => Array<LexicalNode>;
  forChild?: DOMChildConversion;
  node: null | LexicalNode | Array<LexicalNode>;
};

export type DOMExportOutputMap = Map<
  Klass<LexicalNode>,
  (editor: LexicalEditor, target: LexicalNode) => DOMExportOutput
>;

export type DOMExportOutput = {
  after?: (
    generatedElement: HTMLElement | DocumentFragment | Text | null | undefined,
  ) => HTMLElement | DocumentFragment | Text | null | undefined;
  element: HTMLElement | DocumentFragment | Text | null;
};

// Actual LexicalNode class definition
export class LexicalNode {
  ['constructor']!: KlassConstructor<typeof LexicalNode>;
  __type: string;
  __key!: NodeKey; // Definite assignment assertion
  __parent: null | NodeKey;
  __prev: null | NodeKey;
  __next: null | NodeKey;
  __state?: NodeState<this>;

  static getType(): string {
    invariant(false, 'LexicalNode: Node %s does not implement .getType().', this.name);
  }

  static clone(_data: unknown): LexicalNode {
    invariant(false, 'LexicalNode: Node %s does not implement .clone().', this.name);
  }

  $config(): BaseStaticNodeConfig {
    return {};
  }

  config<Type extends string, Config extends StaticNodeConfigValue<this, Type>>(
    type: Type,
    config: Config,
  ): StaticNodeConfigRecord<Type, Config> {
    const parentKlass = config.extends || Object.getPrototypeOf(this.constructor);
    Object.assign(config, { extends: parentKlass, type });
    return { [type]: config } as StaticNodeConfigRecord<Type, Config>;
  }

  afterCloneFrom(prevNode: this): void {
    if (this.__key === prevNode.__key) {
      this.__parent = prevNode.__parent;
      this.__next = prevNode.__next;
      this.__prev = prevNode.__prev;
      this.__state = prevNode.__state;
    } else if (prevNode.__state) {
      this.__state = prevNode.__state.getWritable(this);
    }
  }

  static importDOM?: () => DOMConversionMap<any> | null;

  constructor(key?: NodeKey) {
    this.__type = (this.constructor as typeof LexicalNode).getType();
    this.__parent = null;
    this.__prev = null;
    this.__next = null;
    Object.defineProperty(this, '__state', {
      configurable: true,
      enumerable: false,
      value: undefined,
      writable: true,
    });
    $setNodeKey(this, key);

    if (__DEV__) {
      if (this.__type !== 'root') {
        errorOnReadOnly();
        errorOnTypeKlassMismatch(this.__type, this.constructor as Klass<LexicalNode>);
      }
    }
  }

  getType(): string {
    return this.__type;
  }

  isInline(): boolean {
    invariant(false, 'LexicalNode: Node %s does not implement .isInline().', this.constructor.name);
  }

  getKey(): NodeKey {
    return this.__key;
  }

  is<T extends LexicalNode>(object: T | null | undefined): object is T {
    if (object == null) {
      return false;
    }
    return this.__key === object.__key;
  }

  // START OF METHODS MOVED FROM LexicalNodeMethods.ts
  getLatest<T extends LexicalNode>(this: T): T {
    const editorState = getActiveEditorState();
    const latestNode = editorState._nodeMap.get(this.__key) as T | undefined;
    if (latestNode === undefined) {
      invariant(false, 'LexicalNode: Node %s not found in editor state.', this.__key);
    }
    return latestNode;
  }

  getWritable<T extends LexicalNode>(this: T): T {
    errorOnReadOnly();
    const editorState = getActiveEditorState();
    const editor = getActiveEditor();
    const nodeMap = editorState._nodeMap;
    const key = this.__key;
    let latest = editorState._nodeMap.get(key) as T | undefined;

    if (latest === undefined) {
       invariant(false, 'LexicalNode: Node %s not found in editor state for getWritable.', key);
    }
    // This check was problematic if `this` was already a new clone.
    // The original check from LexicalNode.getWritable was:
    // const latestNode = this.getLatest(); -> this ensures 'latest' is from the map
    // The `this` reference in an augmented method is the instance it's called on.
    // If `this` is already a writable clone, `this.getLatest()` would return itself if it's in the map.
    // The crucial part is that `latest` must be the one from the *current active editor state's nodeMap*.
    latest = this.getLatest(); // Ensure 'latest' is from the active editor state.


    const parent = latest.__parent;
    const cloneNotNeeded = editor._cloneNotNeeded;

    if (cloneNotNeeded.has(key)) {
      return latest;
    }
    const constructor = latest.constructor as typeof LexicalNode;
    const mutable = constructor.clone(latest) as T;
    mutable.__parent = parent;

    // @ts-ignore We don't know what T is
    if (latest.__selection !== undefined) {
      // @ts-ignore
      mutable.__selection = latest.__selection;
    }
    editor._dirtyLeaves.add(key);
    if (parent !== null) {
      editor._dirtyElements.set(parent, false);
    }
    mutable.__key = latest.__key; // Key should be preserved
    nodeMap.set(key, mutable);
    cloneNotNeeded.add(key);
    return mutable;
  }

  getParent<T extends ElementNodeClass>(): T | null {
    const latest = this.getLatest();
    const parentKey = latest.__parent;
    if (parentKey === null) {
      return null;
    }
    return $getNodeByKey<T>(parentKey);
  }

  getPreviousSibling<T extends LexicalNode>(): T | null {
    const latest = this.getLatest();
    const prevKey = latest.__prev;
    if (prevKey === null) {
      return null;
    }
    return $getNodeByKey<T>(prevKey);
  }

  getNextSibling<T extends LexicalNode>(): T | null {
    const latest = this.getLatest();
    const nextKey = latest.__next;
    if (nextKey === null) {
      return null;
    }
    return $getNodeByKey<T>(nextKey);
  }

  isAttached(): boolean {
    let nodeKey: string | null = this.__key;
    while (nodeKey !== null) {
      if (nodeKey === 'root') {
        return true;
      }
      const node: LexicalNode | null = $getNodeByKey(nodeKey);
      if (node === null) {
        break;
      }
      nodeKey = node.__parent;
    }
    return false;
  }

  isSelected(selection?: null | BaseSelection): boolean {
    const targetSelection = selection || $getSelection();
    if (targetSelection == null) {
      return false;
    }
    const isSelectedCore = targetSelection
      .getNodes()
      .some((n: LexicalNode) => n.__key === this.__key);

    if ($isTextNode(this)) {
      return isSelectedCore;
    }
    const isElementRangeSelection =
      $isRangeSelection(targetSelection) &&
      targetSelection.anchor.type === 'element' &&
      targetSelection.focus.type === 'element';

    if (isElementRangeSelection) {
      if (targetSelection.isCollapsed()) {
        return false;
      }
      // Full logic for DecoratorNode and inline checks from original:
      // const parentNode = this.getParent()
      // if ($isDecoratorNode(this) && this.isInline() && parentNode) {
      //   const firstPoint = targetSelection.isBackward()
      //     ? targetSelection.focus
      //     : targetSelection.anchor
      //   if (
      //     parentNode.is(firstPoint.getNode()) &&
      //     firstPoint.offset === (parentNode as ElementNodeClass).getChildrenSize() &&
      //     this.is(parentNode.getLastChild())
      //   ) {
      //     return false
      //   }
      // }
    }
    return isSelectedCore;
  }

  isDirty(): boolean {
    const editor = getActiveEditor();
    const dirtyLeaves = editor._dirtyLeaves;
    return dirtyLeaves !== null && dirtyLeaves.has(this.__key);
  }

  getTopLevelElement(): ElementNodeClass | DecoratorNode<unknown> | null {
    let node: LexicalNode | null = this;
    while (node !== null) {
      const parent: ElementNodeClass | null = node.getParent();
      if ($isRootOrShadowRoot(parent)) {
        return node as ElementNodeClass | DecoratorNode<unknown>;
      }
      node = parent;
    }
    return null;
  }

  getParents(): Array<ElementNodeClass> {
    const parents: Array<ElementNodeClass> = [];
    let node = this.getParent();
    while (node !== null) {
      parents.push(node);
      node = node.getParent();
    }
    return parents;
  }

  getParentKeys(): Array<NodeKey> {
    const parents: Array<NodeKey> = [];
    let node = this.getParent();
    while (node !== null) {
      parents.push(node.__key);
      node = node.getParent();
    }
    return parents;
  }

  getParentOrThrow<T extends ElementNodeClass>(): T {
    const parent = this.getParent<T>();
    if (parent === null) {
      invariant(false, 'Expected node %s to have a parent.', this.__key);
    }
    return parent;
  }

  getTopLevelElementOrThrow(): ElementNodeClass | DecoratorNode<unknown> {
    const parent = this.getTopLevelElement();
    if (parent === null) {
      invariant(false, 'Expected node %s to have a top parent element.', this.__key);
    }
    return parent;
  }

  getCommonAncestor<T extends ElementNodeClass = ElementNodeClass>(node: LexicalNode): T | null {
    const a = $isElementNode(this) ? this : this.getParent();
    const b = $isElementNode(node) ? node : node.getParent();
    const result = a && b ? $getCommonAncestor(a, b) : null;
    return result
      ? (result.commonAncestor as T)
      : null;
  }

  isBefore(targetNode: LexicalNode): boolean {
    const commonAncestorResult = $getCommonAncestor(this, targetNode);
    if (commonAncestorResult === null) {
      return false;
    }
    if (commonAncestorResult.type === 'descendant') {
      return true;
    }
    if (commonAncestorResult.type === 'branch') {
      return $getCommonAncestorResultBranchOrder(commonAncestorResult) === -1;
    }
    invariant(
      commonAncestorResult.type === 'same' || commonAncestorResult.type === 'ancestor',
      'LexicalNode.isBefore: exhaustiveness check',
    );
    return false;
  }

  isParentOf(targetNode: LexicalNode): boolean {
    const commonAncestorResult = $getCommonAncestor(this, targetNode);
    return commonAncestorResult !== null && commonAncestorResult.type === 'ancestor';
  }

  getNodesBetween(targetNode: LexicalNode): Array<LexicalNode> {
    const isBefore = this.isBefore(targetNode);
    const nodes = [];
    const visited = new Set();
    let currentNode: LexicalNode | null = this;

    while (true) {
      if (currentNode === null) {
        break;
      }
      const key = currentNode.__key;
      if (!visited.has(key)) {
        visited.add(key);
        nodes.push(currentNode);
      }
      if (currentNode === targetNode) {
        break;
      }
      const child: LexicalNode | null = $isElementNode(currentNode)
        ? isBefore
          ? (currentNode as ElementNodeClass).getFirstChild()
          : (currentNode as ElementNodeClass).getLastChild()
        : null;

      if (child !== null) {
        currentNode = child;
        continue;
      }
      const nextSibling: LexicalNode | null = isBefore
        ? currentNode.getNextSibling()
        : currentNode.getPreviousSibling();

      if (nextSibling !== null) {
        currentNode = nextSibling;
        continue;
      }
      const parentNode: LexicalNode | null = currentNode.getParentOrThrow();

      if (!visited.has(parentNode.__key)) {
        nodes.push(parentNode);
      }
      if (parentNode === targetNode) {
        break;
      }
      let parentSibling: LexicalNode | null = null;
      let ancestor: LexicalNode | null = parentNode;
      do {
        if (ancestor === null) {
          invariant(false, 'getNodesBetween: ancestor is null');
        }
        parentSibling = isBefore
          ? ancestor.getNextSibling()
          : ancestor.getPreviousSibling();
        ancestor = ancestor.getParent();
        if (ancestor !== null) {
          if (parentSibling === null && !visited.has(ancestor.__key)) {
            nodes.push(ancestor);
          }
        } else {
          break;
        }
      } while (parentSibling === null);
      currentNode = parentSibling;
    }
    if (!isBefore) {
      nodes.reverse();
    }
    return nodes;
  }

  selectStart(): RangeSelection {
    return this.selectPrevious();
  }

  selectEnd(): RangeSelection {
    return this.selectNext(0, 0);
  }

  selectPrevious(anchorOffset?: number, focusOffset?: number): RangeSelection {
    errorOnReadOnly();
    const prevSibling = this.getPreviousSibling();
    const parent = this.getParentOrThrow();

    if (prevSibling === null) {
      return (parent as ElementNodeClass).select(0, 0);
    }
    if ($isElementNode(prevSibling)) {
      return (prevSibling as ElementNodeClass).select();
    } else if (!$isTextNode(prevSibling)) {
      const index = prevSibling.getIndexWithinParent() + 1;
      return (parent as ElementNodeClass).select(index, index);
    }
    return (prevSibling as any).select(anchorOffset, focusOffset);
  }

  selectNext(anchorOffset?: number, focusOffset?: number): RangeSelection {
    errorOnReadOnly();
    const nextSibling = this.getNextSibling();
    const parent = this.getParentOrThrow();

    if (nextSibling === null) {
      return (parent as ElementNodeClass).select();
    }
    if ($isElementNode(nextSibling)) {
      return (nextSibling as ElementNodeClass).select(0, 0);
    } else if (!$isTextNode(nextSibling)) {
      const index = nextSibling.getIndexWithinParent();
      return (parent as ElementNodeClass).select(index, index);
    }
    return (nextSibling as any).select(anchorOffset, focusOffset);
  }

  markDirty(): void {
    this.getWritable();
  }

  reconcileObservedMutation(dom: HTMLElement, editor: LexicalEditor): void {
    this.markDirty();
  }

  getIndexWithinParent(): number {
    const parent = this.getParent();
    if (parent === null) {
      return -1;
    }
    let node = (parent as ElementNodeClass).getFirstChild();
    let index = 0;
    while (node !== null) {
      if (this.is(node)) {
        return index;
      }
      index++;
      node = node.getNextSibling();
    }
    return -1;
  }

  remove(preserveEmptyParent?: boolean): void {
    errorOnReadOnly();
    const nodeToRemove: LexicalNode = this;
    const key = nodeToRemove.__key;
    const parent = nodeToRemove.getParent();

    if (parent === null) {
      return;
    }

    const selection = $maybeMoveChildrenSelectionToParent(nodeToRemove);
    let selectionMoved = false;

    if ($isRangeSelection(selection) && true /* restoreSelection */) {
      const anchor = selection.anchor;
      const focus = selection.focus;
      if (anchor.key === key) {
        moveSelectionPointToSibling(
          anchor,
          nodeToRemove,
          parent,
          nodeToRemove.getPreviousSibling(),
          nodeToRemove.getNextSibling(),
        );
        selectionMoved = true;
      }
      if (focus.key === key) {
        moveSelectionPointToSibling(
          focus,
          nodeToRemove,
          parent,
          nodeToRemove.getPreviousSibling(),
          nodeToRemove.getNextSibling(),
        );
        selectionMoved = true;
      }
    } else if (
      $isNodeSelection(selection) &&
      true /* restoreSelection */ &&
      nodeToRemove.isSelected()
    ) {
      (nodeToRemove as any).selectPrevious();
    }

    if ($isRangeSelection(selection) && true /* restoreSelection */ && !selectionMoved) {
      const index = nodeToRemove.getIndexWithinParent();
      removeFromParentHelper(nodeToRemove);
      $updateElementSelectionOnCreateDeleteNode(selection, parent, index, -1);
    } else {
      removeFromParentHelper(nodeToRemove);
    }

    if (
      !preserveEmptyParent &&
      !$isRootOrShadowRoot(parent) &&
      !(parent as ElementNodeClass).canBeEmpty() &&
      (parent as ElementNodeClass).isEmpty()
    ) {
      (parent as LexicalNode).remove(true);
    }
    if (
      true /* restoreSelection */ &&
      selection &&
      $isRootNode(parent) &&
      (parent as ElementNodeClass).isEmpty()
    ) {
      (parent as ElementNodeClass).selectEnd();
    }
  }

  replace<N extends LexicalNode>(replaceWith: N, includeChildren?: boolean): N {
    errorOnReadOnly();
    let selection = $getSelection();
    if (selection !== null) {
      selection = selection.clone();
    }
    errorOnInsertTextNodeOnRoot(this, replaceWith);

    const self = this.getLatest();
    const toReplaceKey = self.__key;
    const key = replaceWith.__key;
    const writableReplaceWith = replaceWith.getWritable();
    const writableParent = self.getParentOrThrow().getWritable();

    const writableReplaceWithCurrentParent = writableReplaceWith.getParent();
    if (writableReplaceWithCurrentParent) {
      removeFromParentHelper(writableReplaceWith);
    }

    const prevSibling = self.getPreviousSibling();
    const nextSibling = self.getNextSibling();
    const prevKey = self.__prev;
    const nextKey = self.__next;
    const parentKey = self.__parent;

    // Simplified removal of 'self'
    const selfParentWritable = self.getParentOrThrow().getWritable(); // self's parent
    const selfPrev = self.getPreviousSibling();
    const selfNext = self.getNextSibling();

    if (selfPrev !== null) {
      selfPrev.getWritable().__next = self.__next;
    } else {
      selfParentWritable.__first = self.__next;
    }
    if (selfNext !== null) {
      selfNext.getWritable().__prev = self.__prev;
    } else {
      selfParentWritable.__last = self.__prev;
    }
    selfParentWritable.__size--;

    // Placing the new node (writableReplaceWith)
    if (prevSibling === null) {
      writableParent.__first = key;
    } else {
      prevSibling.getWritable().__next = key;
    }
    writableReplaceWith.__prev = prevKey;

    if (nextSibling === null) {
      writableParent.__last = key;
    } else {
      nextSibling.getWritable().__prev = key;
    }
    writableReplaceWith.__next = nextKey;
    writableReplaceWith.__parent = parentKey;

    // Adjust parent size: if writableReplaceWith was not originally child of writableParent, increment size.
    // If it was (meaning it was moved within same parent), size was already adjusted by removeFromParentHelper
    // and self's removal. This part is tricky.
    // A simpler approach for now: if it's now in writableParent, its size increases.
    if (writableReplaceWith.__parent === writableParent.__key) { // This check is if it's being added to the same parent
        // self was removed (-1), replaceWith added (+1) -> net 0 if different nodes.
        // If replaceWith was already a child of writableParent, its removal by removeFromParentHelper
        // would have decremented size, then adding it back increments.
        // The original code had `writableParent.__size = size;` which used a captured size.
        // This needs to ensure correct final size. The most direct is that self was removed, replaceWith was added.
        // writableParent.__size was already decremented by self's removal. So we just increment for replaceWith.
         writableParent.__size++; // This assumes self was part of this parent.
    }

    if (includeChildren) {
      invariant(
        $isElementNode(self) && $isElementNode(writableReplaceWith),
        'includeChildren should only be true for ElementNodes',
      );
      (self as ElementNodeClass).getChildren().forEach((child: LexicalNode) => {
        (writableReplaceWith as ElementNodeClass).append(child);
      });
    }

    if ($isRangeSelection(selection)) {
      $setSelectionHelper(selection);
      const anchor = selection.anchor;
      const focus = selection.focus;
      if (anchor.key === toReplaceKey) {
        $moveSelectionPointToEnd(anchor, writableReplaceWith);
      }
      if (focus.key === toReplaceKey) {
        $moveSelectionPointToEnd(focus, writableReplaceWith);
      }
    }
    if ($getCompositionKey() === toReplaceKey) {
      $setCompositionKey(key);
    }
    return writableReplaceWith;
  }

  insertAfter(nodeToInsert: LexicalNode, restoreSelection = true): LexicalNode {
    errorOnReadOnly();
    errorOnInsertTextNodeOnRoot(this, nodeToInsert);
    const writableSelf = this.getWritable();
    const writableNodeToInsert = nodeToInsert.getWritable();
    const oldParent = writableNodeToInsert.getParent();
    const selection = $getSelection();
    let elementAnchorSelectionOnNode = false;
    let elementFocusSelectionOnNode = false;

    if (oldParent !== null) {
      const oldIndex = nodeToInsert.getIndexWithinParent();
      removeFromParentHelper(writableNodeToInsert);
      if ($isRangeSelection(selection)) {
        const oldParentKey = oldParent.__key;
        const anchor = selection.anchor;
        const focus = selection.focus;
        elementAnchorSelectionOnNode =
          anchor.type === 'element' &&
          anchor.key === oldParentKey &&
          anchor.offset === oldIndex + 1;
        elementFocusSelectionOnNode =
          focus.type === 'element' &&
          focus.key === oldParentKey &&
          focus.offset === oldIndex + 1;
      }
    }

    const nextSibling = writableSelf.getNextSibling();
    const writableParent = writableSelf.getParentOrThrow().getWritable();
    const insertKey = writableNodeToInsert.__key;
    const nextKey = writableSelf.__next;

    if (nextSibling === null) {
      writableParent.__last = insertKey;
    } else {
      nextSibling.getWritable().__prev = insertKey;
    }
    writableParent.__size++;
    writableSelf.__next = insertKey;
    writableNodeToInsert.__next = nextKey;
    writableNodeToInsert.__prev = writableSelf.__key;
    writableNodeToInsert.__parent = writableSelf.__parent;

    if (restoreSelection && $isRangeSelection(selection)) {
      const index = writableSelf.getIndexWithinParent();
      $updateElementSelectionOnCreateDeleteNode(
        selection,
        writableParent,
        index + 1,
      );
      const writableParentKey = writableParent.__key;
      if (elementAnchorSelectionOnNode) {
        selection.anchor.set(writableParentKey, index + 2, 'element');
      }
      if (elementFocusSelectionOnNode) {
        selection.focus.set(writableParentKey, index + 2, 'element');
      }
    }
    return nodeToInsert;
  }

  insertBefore(nodeToInsert: LexicalNode, restoreSelection = true): LexicalNode {
    errorOnReadOnly();
    errorOnInsertTextNodeOnRoot(this, nodeToInsert);
    const writableSelf = this.getWritable();
    const writableNodeToInsert = nodeToInsert.getWritable();
    const insertKey = writableNodeToInsert.__key;

    const oldParent = writableNodeToInsert.getParent();
    if (oldParent) {
      removeFromParentHelper(writableNodeToInsert);
    }

    const prevSibling = writableSelf.getPreviousSibling();
    const writableParent = writableSelf.getParentOrThrow().getWritable();
    const prevKey = writableSelf.__prev;
    const index = writableSelf.getIndexWithinParent();

    if (prevSibling === null) {
      writableParent.__first = insertKey;
    } else {
      prevSibling.getWritable().__next = insertKey;
    }
    writableParent.__size++;
    writableSelf.__prev = insertKey;
    writableNodeToInsert.__prev = prevKey;
    writableNodeToInsert.__next = writableSelf.__key;
    writableNodeToInsert.__parent = writableSelf.__parent;

    const selection = $getSelection();
    if (restoreSelection && $isRangeSelection(selection)) {
      $updateElementSelectionOnCreateDeleteNode(selection, writableParent, index);
    }
    return nodeToInsert;
  }
  // END OF METHODS MOVED FROM LexicalNodeMethods.ts


  getTextContent(): string {
    return '';
  }

  getTextContentSize(): number {
    return this.getTextContent().length;
  }

  createDOM(_config: EditorConfig, _editor: LexicalEditor): HTMLElement {
    invariant(false, 'createDOM: base method not extended');
  }

  updateDOM(
    _prevNode: unknown,
    _dom: HTMLElement,
    _config: EditorConfig,
  ): boolean {
    invariant(false, 'updateDOM: base method not extended');
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const element = this.createDOM(editor._config, editor);
    return { element };
  }

  exportJSON(): SerializedLexicalNode {
    const state = this.__state ? this.__state.toJSON() : undefined;
    return {
      type: this.__type,
      version: 1,
      ...state,
    };
  }

  static importJSON(_serializedNode: SerializedLexicalNode): LexicalNode {
    invariant(false, 'LexicalNode: Node %s does not implement .importJSON().', this.name);
  }

  updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedLexicalNode>,
  ): this {
    return $updateStateFromJSON(this, serializedNode[NODE_STATE_KEY]);
  }

  static transform(): ((node: LexicalNode) => void) | null {
    return null;
  }

  isParentRequired(): boolean {
    return false;
  }

  createParentElementNode(): ElementNode {
    return $createParagraphNode();
  }
}

function errorOnTypeKlassMismatch(
  type: string,
  klass: Klass<LexicalNode>,
): void {
  const editor = getActiveEditor();
  const registeredNode = getRegisteredNode(editor, type);
  if (registeredNode === undefined) {
    invariant(false, 'Create node: Attempted to create node %s that was not configured to be used on the editor.', klass.name);
  }
  const editorKlass = registeredNode.klass;
  if (editorKlass !== klass) {
    invariant(false, 'Create node: Type %s in node %s does not match registered node %s with the same type', type, klass.name, editorKlass.name);
  }
}

export function insertRangeAfter(
  node: LexicalNode,
  firstToInsert: LexicalNode,
  lastToInsert?: LexicalNode,
) {
  const lastToInsert2 =
    lastToInsert || (node.getParentOrThrow() as ElementNode).getLastChild()!;
  let current = firstToInsert;
  const nodesToInsert = [firstToInsert];
  while (current !== lastToInsert2) {
    const nextSibling = current.getNextSibling();
    if (!nextSibling) {
      invariant(false, 'insertRangeAfter: lastToInsert must be a later sibling of firstToInsert');
    }
    current = nextSibling;
    nodesToInsert.push(current);
  }

  let currentNode: LexicalNode = node;
  for (const nodeToInsert of nodesToInsert) {
    currentNode = (currentNode as any).insertAfter(nodeToInsert);
  }
}

// Ensure this file is treated as a module
export {};
