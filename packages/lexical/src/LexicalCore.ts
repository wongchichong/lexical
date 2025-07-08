/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

// SECTION: IMPORTS (Consolidated and de-duplicated)
// -----------------------------------------------------------------------------

// Imports originally for LexicalCore (Editor, EditorState, Updates) AND LexicalNode (Node, NodeMethods)
import invariant from 'shared/invariant';
import { CAN_USE_DOM, IS_APPLE, IS_APPLE_WEBKIT, IS_IOS, IS_SAFARI } from 'shared/environment';
import {
  errorOnReadOnly,
  getActiveEditor,
  getActiveEditorState,
  internalGetActiveEditor, // Added for LexicalEditor class usage
  internalGetActiveEditorState, // Added for LexicalEditor class usage
  isCurrentlyReadOnlyMode, // Used by LexicalNode constructor
  $commitPendingUpdates, // Used by LexicalEditor
  updateEditor, // Used by LexicalEditor
  readEditorState, // Used by LexicalEditor
  $applyTransforms, // Used by LexicalEditor
  $parseSerializedNode, // Used by LexicalEditor
  parseEditorState as parseEditorStateFromUpdates, // Alias to avoid conflict if a local one exists or for clarity
  // internalCallUpdateFunctions, // This is complex, editor calls it.
  // $maybeRestorePreviousSelection, // Used by $commitPendingUpdates
} from './LexicalUpdates';
import type {
  RangeSelection,
  BaseSelection,
  PointType,
  NodeSelection as NodeSelectionType // Alias if NodeSelection class name is used locally
} from './LexicalSelection';
import {
  $getSelection,
  $isRangeSelection,
  $isNodeSelection,
  moveSelectionPointToSibling,
  $updateElementSelectionOnCreateDeleteNode,
  $moveSelectionPointToEnd,
  // For LexicalNode.select / ElementNode.select / TextNode.select if they are now in LexicalCore
  $createPoint,
  $internalMakeRangeSelection
} from './LexicalSelection';
import normalizeClassNames from 'shared/normalizeClassNames';
import warnOnlyOnce from 'shared/warnOnlyOnce';

import {
  FULL_RECONCILE,
  NO_DIRTY_NODES,
  NODE_STATE_KEY,
  PROTOTYPE_CONFIG_METHOD,
  TEXT_TYPE_TO_FORMAT,
  COMPOSITION_SUFFIX,
  DOM_DOCUMENT_FRAGMENT_TYPE,
  DOM_DOCUMENT_TYPE,
  DOM_ELEMENT_TYPE,
  DOM_TEXT_TYPE,
  HAS_DIRTY_NODES,
  LTR_REGEX,
  RTL_REGEX,
} from './LexicalConstants';

import { addRootElementEvents, removeRootElementEvents, markCollapsedSelectionFormat, markSelectionChangeFromDOMUpdate, type EventHandler } from './LexicalEvents'; // LexicalEvents still separate
import { flushRootMutations, initMutationObserver, getIsProcessingMutations } from './LexicalMutations'; // LexicalMutations still separate
import { createSharedNodeState, $updateStateFromJSON, nodeStatesAreEquivalent, type NodeState, type NodeStateJSON, type Prettify, type RequiredNodeStateConfig, type StateConfigValue, type StateConfigKey, type ValueOrUpdater, type StateValueOrUpdater, type AnyStateConfig, type StateConfig, type StateValueConfig, createState, $getState, $getStateChange, $setState, type SharedNodeState, $getWritableNodeState, $getSharedNodeState, $cloneNodeState } from './LexicalNodeState'; // LexicalNodeState still separate

import { FOCUS_TAG, HISTORY_MERGE_TAG, UpdateTag, SKIP_DOM_SELECTION_TAG, COLLABORATION_TAG, SKIP_SCROLL_INTO_VIEW_TAG } from './LexicalUpdateTags';

// LexicalUtils and LexicalSelection will be progressively merged or refactored.
// For now, assume their functions are available globally or will be imported by LexicalCore later.
// This is a simplification for this step. A full merge would inline them or make them local.
import {
  $addUpdateTag, // Used by LexicalEditor
  // $getRoot, // Defined below from LexicalNode section
  $onUpdate, // Used by LexicalEditor
  // $setSelection, // Defined below from LexicalSelection section
  createUID, // Used by LexicalEditor
  dispatchCommand, // Used by LexicalEditor
  getCachedClassNameArray, // Used by LexicalEditor
  getCachedTypeToNodeMap, // Used by LexicalEditor & LexicalNode
  getDefaultView, // Used by LexicalEditor
  // getDOMSelection, // Defined below from LexicalSelection section
  getStaticNodeConfig, // Used by LexicalEditor
  hasOwnExportDOM, // Used by LexicalEditor
  hasOwnStaticMethod, // Used by LexicalEditor
  markNodesWithTypesAsDirty, // Used by LexicalEditor
  $getCompositionKey, // Used by LexicalNodeMethods (now in LexicalNode), LexicalUpdates (now local)
  getEditorPropertyFromDOMNode, // Used by LexicalEditor & LexicalUpdates (now local)
  getEditorStateTextContent, // Used by LexicalUpdates (now local)
  getEditorsToPropagate, // Used by LexicalUpdates (now local)
  getRegisteredNodeOrThrow, // Used by LexicalUpdates (now local)
  getWindow, // Used by LexicalEditor & LexicalUpdates (now local)
  isLexicalEditor as isLexicalEditorUtil,
  removeDOMBlockCursorElement, // Used by LexicalUpdates (now local)
  scheduleMicroTask, // Used by LexicalUpdates (now local)
  setPendingNodeToClone, // Used by LexicalUpdates (now local)
  updateDOMBlockCursorElement, // Used by LexicalUpdates (now local)
  $getNodeByKey, // Heavily used
  $isRootOrShadowRoot, // Used by LexicalNodeMethods (now in LexicalNode)
  removeFromParent as removeFromParentHelper, // Used by LexicalNodeMethods (now in LexicalNode)
  errorOnInsertTextNodeOnRoot, // Used by LexicalNodeMethods (now in LexicalNode)
  $setCompositionKey, // Used by LexicalNodeMethods (now in LexicalNode), LexicalUpdates (now local)
  $maybeMoveChildrenSelectionToParent, // Used by LexicalNodeMethods (now in LexicalNode)
  $setNodeKey, // Used by LexicalNode constructor
  getRegisteredNode, // Used by LexicalNode (errorOnTypeKlassMismatch)
  $getNodeFromDOMNode, // Used by LexicalSelection (now local)
  $getNearestNodeFromDOMNode, // Used by LexicalSelection (now local)
  $getNearestRootOrShadowRoot, // Used by LexicalSelection (now local)
  $hasAncestor, // Used by LexicalSelection (now local)
  $isTokenOrSegmented, // Used by LexicalSelection (now local)
  $isTokenOrTab, // Used by LexicalSelection (now local)
  $updateTextNodeFromDOMContent, // Used by LexicalMutations (still separate)
  INTERNAL_$isBlock, // Used by LexicalSelection (now local)
  isSelectionWithinEditor, // Used by LexicalSelection (now local)
  // ... other utils
} from './LexicalUtils';

// Specific Node type imports (these are fine as they are leaf dependencies for Core)
import { ArtificialNode__DO_NOT_USE } from './nodes/ArtificialNode';
import { $isDecoratorNode, DecoratorNode } from './nodes/LexicalDecoratorNode';
import { $isElementNode, ElementNode, ElementNode as ElementNodeClass } from './nodes/LexicalElementNode';
import { LineBreakNode, $isLineBreakNode, $createLineBreakNode } from './nodes/LexicalLineBreakNode';
import { ParagraphNode, $createParagraphNode } from './nodes/LexicalParagraphNode';
import { $createRootNode, RootNode, $isRootNode } from './nodes/LexicalRootNode';
import { TabNode, $createTabNode, $isTabNode } from './nodes/LexicalTabNode';
import { $isTextNode, TextNode, TextNode as LexicalTextNodeClass } from './nodes/LexicalTextNode';

// Imports for LexicalSelection logic (will be merged here)
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
  CaretRange, // Type
  ChildCaret, // Type
  NodeCaret, // Type
  PointCaret // Type
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


import { $garbageCollectDetachedDecorators, $garbageCollectDetachedNodes } from './LexicalGC'; // LexicalGC still separate
import { $normalizeTextNode, $normalizeSelection as $normalizeSelectionNormalization } from './LexicalNormalization'; // LexicalNormalization still separate, alias $normalizeSelection
import { $reconcileRoot } from './LexicalReconciler'; // LexicalReconciler still separate
import { SELECTION_CHANGE_COMMAND, BLUR_COMMAND, CLICK_COMMAND, CONTROLLED_TEXT_INSERTION_COMMAND, COPY_COMMAND, CUT_COMMAND, DELETE_CHARACTER_COMMAND, DELETE_LINE_COMMAND, DELETE_WORD_COMMAND, DRAGEND_COMMAND, DRAGOVER_COMMAND, DRAGSTART_COMMAND, DROP_COMMAND, FOCUS_COMMAND, FORMAT_TEXT_COMMAND, INSERT_LINE_BREAK_COMMAND, INSERT_PARAGRAPH_COMMAND, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_LEFT_COMMAND, KEY_ARROW_RIGHT_COMMAND, KEY_ARROW_UP_COMMAND, KEY_BACKSPACE_COMMAND, KEY_DELETE_COMMAND, KEY_DOWN_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, KEY_SPACE_COMMAND, KEY_TAB_COMMAND, MOVE_TO_END, MOVE_TO_START, PASTE_COMMAND, REDO_COMMAND, REMOVE_TEXT_COMMAND, UNDO_COMMAND, KEY_MODIFIER_COMMAND, SELECT_ALL_COMMAND, SELECTION_INSERT_CLIPBOARD_NODES_COMMAND, createCommand as createLexicalCommand } from './LexicalCommands'; // LexicalCommands still separate, alias createCommand


// SECTION: LexicalNode_Temp_Merged.ts content
// -----------------------------------------------------------------------------
// All type definitions from LexicalNode.ts and LexicalNodeMethods.ts
// All class definition for LexicalNode with methods from LexicalNode.ts and LexicalNodeMethods.ts
// All helper functions from LexicalNode.ts (errorOnTypeKlassMismatch, insertRangeAfter)

export type NodeKey = string; // From LexicalNode.ts

// Forward declare LexicalNode for use in types before class definition
// This is a simplified forward declaration. The full class is defined below.
declare class LexicalNodeForTypes {
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
  getChildrenSize(): number;
  getLastChild(): LexicalNode | null;
  isInline(): boolean;
  getChildren(): Array<LexicalNode>;
  append(...nodesToAppend: LexicalNode[]): ElementNodeClass;
  getIndexWithinParent(): number;
  selectPrevious(anchorOffset?: number, focusOffset?: number): RangeSelection;
  selectNext(anchorOffset?: number, focusOffset?: number): RangeSelection;
}


export type NodeMap = Map<NodeKey, LexicalNode>;

export type SerializedLexicalNode = {
  type: string;
  version: number;
  [NODE_STATE_KEY]?: Record<string, unknown>;
};

export interface StaticNodeConfigValue<
  T extends LexicalNode, // Use the actual LexicalNode class here
  Type extends string,
> {
  readonly type?: Type;
  readonly $transform?: (node: T) => void;
  readonly $importJSON?: (serializedNode: SerializedLexicalNode) => T;
  readonly importDOM?: DOMConversionMap;
  readonly stateConfigs?: readonly RequiredNodeStateConfig[];
  readonly extends?: Klass<LexicalNode>; // Klass will be defined later (from LexicalEditor part)
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

// LexicalEditor type is now defined within this file, so DOMExportOutputMap needs that.
export type DOMExportOutputMap = Map<
  Klass<LexicalNode>, // Klass will be defined later
  (editor: LexicalEditor, target: LexicalNode) => DOMExportOutput // LexicalEditor will be defined later
>;

export type DOMExportOutput = {
  after?: (
    generatedElement: HTMLElement | DocumentFragment | Text | null | undefined,
  ) => HTMLElement | DocumentFragment | Text | null | undefined;
  element: HTMLElement | DocumentFragment | Text | null;
};


// Actual LexicalNode class definition with methods integrated
export class LexicalNode {
  ['constructor']!: KlassConstructor<typeof LexicalNode>; // KlassConstructor will be defined later
  __type: string;
  __key!: NodeKey;
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
    $setNodeKey(this, key); // From LexicalUtils, now needs to be local or passed if LexicalUtils is merged

    if (__DEV__) {
      if (this.__type !== 'root') {
        errorOnReadOnly(); // Now local
        errorOnTypeKlassMismatch(this.__type, this.constructor as Klass<LexicalNode>); // Now local
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

  // Methods from LexicalNodeMethods.ts integrated here
  getLatest<T extends LexicalNode>(this: T): T {
    const editorState = getActiveEditorState(); // Now local
    const latestNode = editorState._nodeMap.get(this.__key) as T | undefined;
    if (latestNode === undefined) {
      invariant(false, 'LexicalNode: Node %s not found in editor state.', this.__key);
    }
    return latestNode;
  }

  getWritable<T extends LexicalNode>(this: T): T {
    errorOnReadOnly(); // Now local
    const editorState = getActiveEditorState(); // Now local
    const editor = getActiveEditor(); // Now local
    const nodeMap = editorState._nodeMap;
    const key = this.__key;
    let latest = this.getLatest(); // Uses the local getLatest

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
    mutable.__key = latest.__key;
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
    return $getNodeByKey<T>(parentKey); // $getNodeByKey from LexicalUtils (or local if merged)
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
    const targetSelection = selection || $getSelection(); // $getSelection from LexicalSelection (or local if merged)
    if (targetSelection == null) {
      return false;
    }
    const isSelectedCore = targetSelection
      .getNodes()
      .some((n: LexicalNode) => n.__key === this.__key);

    if ($isTextNode(this)) { // $isTextNode from nodes/LexicalTextNode (or local)
      return isSelectedCore;
    }
    const isElementRangeSelection =
      $isRangeSelection(targetSelection) && // $isRangeSelection from LexicalSelection (or local)
      targetSelection.anchor.type === 'element' &&
      targetSelection.focus.type === 'element';

    if (isElementRangeSelection) {
      if (targetSelection.isCollapsed()) {
        return false;
      }
    }
    return isSelectedCore;
  }

  isDirty(): boolean {
    const editor = getActiveEditor(); // Now local
    const dirtyLeaves = editor._dirtyLeaves;
    return dirtyLeaves !== null && dirtyLeaves.has(this.__key);
  }

  getTopLevelElement(): ElementNodeClass | DecoratorNode<unknown> | null {
    let node: LexicalNode | null = this;
    while (node !== null) {
      const parent: ElementNodeClass | null = node.getParent(); // local augmented
      if ($isRootOrShadowRoot(parent)) { // $isRootOrShadowRoot from LexicalUtils (or local)
        return node as ElementNodeClass | DecoratorNode<unknown>;
      }
      node = parent;
    }
    return null;
  }

  getParents(): Array<ElementNodeClass> {
    const parents: Array<ElementNodeClass> = [];
    let node = this.getParent(); // local augmented
    while (node !== null) {
      parents.push(node);
      node = node.getParent(); // local augmented
    }
    return parents;
  }

  getParentKeys(): Array<NodeKey> {
    const parents: Array<NodeKey> = [];
    let node = this.getParent(); // local augmented
    while (node !== null) {
      parents.push(node.__key);
      node = node.getParent(); // local augmented
    }
    return parents;
  }

  getParentOrThrow<T extends ElementNodeClass>(): T {
    const parent = this.getParent<T>(); // local augmented
    if (parent === null) {
      invariant(false, 'Expected node %s to have a parent.', this.__key);
    }
    return parent;
  }

  getTopLevelElementOrThrow(): ElementNodeClass | DecoratorNode<unknown> {
    const parent = this.getTopLevelElement(); // local augmented
    if (parent === null) {
      invariant(false, 'Expected node %s to have a top parent element.', this.__key);
    }
    return parent;
  }

  getCommonAncestor<T extends ElementNodeClass = ElementNodeClass>(node: LexicalNode): T | null {
    const a = $isElementNode(this) ? this : this.getParent(); // local augmented
    const b = $isElementNode(node) ? node : node.getParent(); // local augmented
    const result = a && b ? $getCommonAncestor(a, b) : null; // $getCommonAncestor from LexicalCaret (or local)
    return result
      ? (result.commonAncestor as T)
      : null;
  }

  isBefore(targetNode: LexicalNode): boolean {
    const commonAncestorResult = $getCommonAncestor(this, targetNode); // from LexicalCaret (or local)
    if (commonAncestorResult === null) {
      return false;
    }
    if (commonAncestorResult.type === 'descendant') {
      return true;
    }
    if (commonAncestorResult.type === 'branch') {
      return $getCommonAncestorResultBranchOrder(commonAncestorResult) === -1; // from LexicalCaret (or local)
    }
    invariant(
      commonAncestorResult.type === 'same' || commonAncestorResult.type === 'ancestor',
      'LexicalNode.isBefore: exhaustiveness check',
    );
    return false;
  }

  isParentOf(targetNode: LexicalNode): boolean {
    const commonAncestorResult = $getCommonAncestor(this, targetNode); // from LexicalCaret (or local)
    return commonAncestorResult !== null && commonAncestorResult.type === 'ancestor';
  }

  getNodesBetween(targetNode: LexicalNode): Array<LexicalNode> {
    const isBefore = this.isBefore(targetNode); // local augmented
    const nodes = [];
    const visited = new Set();
    let currentNode: LexicalNode | null = this;

    while (true) {
      if (currentNode === null) break;
      const key = currentNode.__key;
      if (!visited.has(key)) {
        visited.add(key);
        nodes.push(currentNode);
      }
      if (currentNode === targetNode) break;

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
        ? currentNode.getNextSibling() // local augmented
        : currentNode.getPreviousSibling(); // local augmented

      if (nextSibling !== null) {
        currentNode = nextSibling;
        continue;
      }
      const parentNode: LexicalNode | null = currentNode.getParentOrThrow(); // local augmented

      if (!visited.has(parentNode.__key)) {
        nodes.push(parentNode);
      }
      if (parentNode === targetNode) break;

      let parentSibling: LexicalNode | null = null;
      let ancestor: LexicalNode | null = parentNode;
      do {
        if (ancestor === null) invariant(false, 'getNodesBetween: ancestor is null');
        parentSibling = isBefore
          ? ancestor.getNextSibling() // local augmented
          : ancestor.getPreviousSibling(); // local augmented
        ancestor = ancestor.getParent(); // local augmented
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
    return this.selectPrevious(); // local augmented
  }

  selectEnd(): RangeSelection {
    return this.selectNext(0, 0); // local augmented
  }

  selectPrevious(anchorOffset?: number, focusOffset?: number): RangeSelection {
    errorOnReadOnly(); // local
    const prevSibling = this.getPreviousSibling(); // local augmented
    const parent = this.getParentOrThrow(); // local augmented

    if (prevSibling === null) {
      return (parent as ElementNodeClass).select(0, 0);
    }
    if ($isElementNode(prevSibling)) {
      return (prevSibling as ElementNodeClass).select();
    } else if (!$isTextNode(prevSibling)) {
      const index = prevSibling.getIndexWithinParent() + 1; // local augmented
      return (parent as ElementNodeClass).select(index, index);
    }
    return (prevSibling as any).select(anchorOffset, focusOffset);
  }

  selectNext(anchorOffset?: number, focusOffset?: number): RangeSelection {
    errorOnReadOnly(); // local
    const nextSibling = this.getNextSibling(); // local augmented
    const parent = this.getParentOrThrow(); // local augmented

    if (nextSibling === null) {
      return (parent as ElementNodeClass).select();
    }
    if ($isElementNode(nextSibling)) {
      return (nextSibling as ElementNodeClass).select(0, 0);
    } else if (!$isTextNode(nextSibling)) {
      const index = nextSibling.getIndexWithinParent(); // local augmented
      return (parent as ElementNodeClass).select(index, index);
    }
    return (nextSibling as any).select(anchorOffset, focusOffset);
  }

  markDirty(): void {
    this.getWritable(); // local augmented
  }

  reconcileObservedMutation(dom: HTMLElement, editor: LexicalEditor): void { // LexicalEditor will be local
    this.markDirty(); // local augmented
  }

  getIndexWithinParent(): number {
    const parent = this.getParent(); // local augmented
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
      node = node.getNextSibling(); // local augmented
    }
    return -1;
  }

  remove(preserveEmptyParent?: boolean): void {
    errorOnReadOnly(); // local
    const nodeToRemove: LexicalNode = this;
    const key = nodeToRemove.__key;
    const parent = nodeToRemove.getParent(); // local augmented

    if (parent === null) {
      return;
    }
    const selection = $maybeMoveChildrenSelectionToParent(nodeToRemove); // from LexicalUtils (or local)
    let selectionMoved = false;

    if ($isRangeSelection(selection) && true) {
      const anchor = selection.anchor;
      const focus = selection.focus;
      if (anchor.key === key) {
        moveSelectionPointToSibling( // from LexicalSelection (or local)
          anchor, nodeToRemove, parent,
          nodeToRemove.getPreviousSibling(), nodeToRemove.getNextSibling(),
        );
        selectionMoved = true;
      }
      if (focus.key === key) {
        moveSelectionPointToSibling( // from LexicalSelection (or local)
          focus, nodeToRemove, parent,
          nodeToRemove.getPreviousSibling(), nodeToRemove.getNextSibling(),
        );
        selectionMoved = true;
      }
    } else if ($isNodeSelection(selection) && true && nodeToRemove.isSelected()) { // local augmented
      (nodeToRemove as any).selectPrevious(); // local augmented
    }

    if ($isRangeSelection(selection) && true && !selectionMoved) {
      const index = nodeToRemove.getIndexWithinParent(); // local augmented
      removeFromParentHelper(nodeToRemove); // from LexicalUtils (or local)
      $updateElementSelectionOnCreateDeleteNode(selection, parent, index, -1); // from LexicalSelection (or local)
    } else {
      removeFromParentHelper(nodeToRemove); // from LexicalUtils (or local)
    }

    if (!preserveEmptyParent && !$isRootOrShadowRoot(parent) &&
        !(parent as ElementNodeClass).canBeEmpty() && (parent as ElementNodeClass).isEmpty()) {
      (parent as LexicalNode).remove(true); // local augmented
    }
    if (true && selection && $isRootNode(parent) && (parent as ElementNodeClass).isEmpty()) {
      (parent as ElementNodeClass).selectEnd();
    }
  }

  replace<N extends LexicalNode>(replaceWith: N, includeChildren?: boolean): N {
    errorOnReadOnly(); // local
    let selection = $getSelection(); // from LexicalSelection (or local)
    if (selection !== null) {
      selection = selection.clone();
    }
    errorOnInsertTextNodeOnRoot(this, replaceWith); // from LexicalUtils (or local)

    const self = this.getLatest(); // local augmented
    const toReplaceKey = self.__key;
    const key = replaceWith.__key;
    const writableReplaceWith = replaceWith.getWritable(); // local augmented
    const writableParent = self.getParentOrThrow().getWritable(); // local augmented

    const writableReplaceWithCurrentParent = writableReplaceWith.getParent(); // local augmented
    if (writableReplaceWithCurrentParent) {
      removeFromParentHelper(writableReplaceWith); // from LexicalUtils (or local)
    }

    const prevSibling = self.getPreviousSibling(); // local augmented
    const nextSibling = self.getNextSibling(); // local augmented
    const prevKey = self.__prev;
    const nextKey = self.__next;
    const parentKey = self.__parent;

    const selfParentWritable = self.getParentOrThrow().getWritable(); // local augmented
    const selfPrev = self.getPreviousSibling(); // local augmented
    const selfNext = self.getNextSibling(); // local augmented

    if (selfPrev !== null) {
      selfPrev.getWritable().__next = self.__next; // local augmented
    } else {
      selfParentWritable.__first = self.__next;
    }
    if (selfNext !== null) {
      selfNext.getWritable().__prev = self.__prev; // local augmented
    } else {
      selfParentWritable.__last = self.__prev;
    }
    selfParentWritable.__size--;

    if (prevSibling === null) {
      writableParent.__first = key;
    } else {
      prevSibling.getWritable().__next = key; // local augmented
    }
    writableReplaceWith.__prev = prevKey;

    if (nextSibling === null) {
      writableParent.__last = key;
    } else {
      nextSibling.getWritable().__prev = key; // local augmented
    }
    writableReplaceWith.__next = nextKey;
    writableReplaceWith.__parent = parentKey;
     if (writableParent === selfParentWritable) {
       writableParent.__size++;
   } else {
       writableParent.__size++;
   }

    if (includeChildren) {
      invariant(
        $isElementNode(self) && $isElementNode(writableReplaceWith), // $isElementNode local or from nodes
        'includeChildren should only be true for ElementNodes',
      );
      (self as ElementNodeClass).getChildren().forEach((child: LexicalNode) => { // getChildren is ElementNode method
        (writableReplaceWith as ElementNodeClass).append(child); // append is ElementNode method
      });
    }

    if ($isRangeSelection(selection)) { // $isRangeSelection from LexicalSelection (or local)
      $setSelectionHelper(selection);  // from LexicalUtils (or local)
      const anchor = selection.anchor;
      const focus = selection.focus;
      if (anchor.key === toReplaceKey) {
        $moveSelectionPointToEnd(anchor, writableReplaceWith); // from LexicalSelection (or local)
      }
      if (focus.key === toReplaceKey) {
        $moveSelectionPointToEnd(focus, writableReplaceWith); // from LexicalSelection (or local)
      }
    }
    if ($getCompositionKey() === toReplaceKey) { // $getCompositionKey from LexicalUtils (or local)
      $setCompositionKey(key); // $setCompositionKey from LexicalUtils (or local)
    }
    return writableReplaceWith;
  }

  insertAfter(nodeToInsert: LexicalNode, restoreSelection = true): LexicalNode {
    errorOnReadOnly(); // local
    errorOnInsertTextNodeOnRoot(this, nodeToInsert); // from LexicalUtils (or local)
    const writableSelf = this.getWritable(); // local augmented
    const writableNodeToInsert = nodeToInsert.getWritable(); // local augmented
    const oldParent = writableNodeToInsert.getParent(); // local augmented
    const selection = $getSelection(); // from LexicalSelection (or local)
    let elementAnchorSelectionOnNode = false;
    let elementFocusSelectionOnNode = false;

    if (oldParent !== null) {
      const oldIndex = nodeToInsert.getIndexWithinParent(); // local augmented
      removeFromParentHelper(writableNodeToInsert); // from LexicalUtils (or local)
      if ($isRangeSelection(selection)) { // $isRangeSelection from LexicalSelection (or local)
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

    const nextSibling = writableSelf.getNextSibling(); // local augmented
    const writableParent = writableSelf.getParentOrThrow().getWritable(); // local augmented
    const insertKey = writableNodeToInsert.__key;
    const nextKey = writableSelf.__next;

    if (nextSibling === null) {
      writableParent.__last = insertKey;
    } else {
      nextSibling.getWritable().__prev = insertKey; // local augmented
    }
    writableParent.__size++;
    writableSelf.__next = insertKey;
    writableNodeToInsert.__next = nextKey;
    writableNodeToInsert.__prev = writableSelf.__key;
    writableNodeToInsert.__parent = writableSelf.__parent;

    if (restoreSelection && $isRangeSelection(selection)) {
      const index = writableSelf.getIndexWithinParent(); // local augmented
      $updateElementSelectionOnCreateDeleteNode( // from LexicalSelection (or local)
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
    errorOnReadOnly(); // local
    errorOnInsertTextNodeOnRoot(this, nodeToInsert); // from LexicalUtils (or local)
    const writableSelf = this.getWritable(); // local augmented
    const writableNodeToInsert = nodeToInsert.getWritable(); // local augmented
    const insertKey = writableNodeToInsert.__key;

    const oldParent = writableNodeToInsert.getParent(); // local augmented
    if (oldParent) {
      removeFromParentHelper(writableNodeToInsert); // from LexicalUtils (or local)
    }

    const prevSibling = writableSelf.getPreviousSibling(); // local augmented
    const writableParent = writableSelf.getParentOrThrow().getWritable(); // local augmented
    const prevKey = writableSelf.__prev;
    const index = writableSelf.getIndexWithinParent(); // local augmented

    if (prevSibling === null) {
      writableParent.__first = insertKey;
    } else {
      prevSibling.getWritable().__next = insertKey; // local augmented
    }
    writableParent.__size++;
    writableSelf.__prev = insertKey;
    writableNodeToInsert.__prev = prevKey;
    writableNodeToInsert.__next = writableSelf.__key;
    writableNodeToInsert.__parent = writableSelf.__parent;

    const selection = $getSelection(); // from LexicalSelection (or local)
    if (restoreSelection && $isRangeSelection(selection)) { // $isRangeSelection from LexicalSelection (or local)
      $updateElementSelectionOnCreateDeleteNode(selection, writableParent, index); // from LexicalSelection (or local)
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

  createParentElementNode(): ElementNode { // ElementNode from ./nodes/LexicalElementNode
    return $createParagraphNode(); // from ./nodes/LexicalParagraphNode
  }
}

// Helper functions originally from LexicalNode.ts
function errorOnTypeKlassMismatch(
  type: string,
  klass: Klass<LexicalNode>, // Klass will be part of LexicalCore
): void {
  const editor = getActiveEditor(); // Now local
  const registeredNode = getRegisteredNode(editor, type); // From LexicalUtils (or local)
  if (registeredNode === undefined) {
    invariant(false, 'Create node: Attempted to create node %s that was not configured to be used on the editor.', klass.name);
  }
  const editorKlass = registeredNode.klass;
  if (editorKlass !== klass) {
    invariant(false, 'Create node: Type %s in node %s does not match registered node %s with the same type', type, klass.name, editorKlass.name);
  }
}

export function insertRangeAfter( // Keep this exported if it's used externally
  node: LexicalNode,
  firstToInsert: LexicalNode,
  lastToInsert?: LexicalNode,
) {
  const lastToInsert2 =
    lastToInsert || (node.getParentOrThrow() as ElementNodeClass).getLastChild()!;
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

// END OF LexicalNode_Temp_Merged.ts content


// SECTION: LexicalEditorState.ts content (already in LexicalCore.ts)
// ...

// SECTION: LexicalUpdates.ts content is now in LexicalUpdates.ts
// ...

// SECTION: LexicalEditor.ts content (already in LexicalCore.ts)
// ...


// Ensure all necessary exports are present

// Re-export from LexicalUpdates
export * from './LexicalUpdates';

// Exports from original LexicalCore (Editor, EditorState parts that remain, plus LexicalEditor class)
export {
  EditorState, createEmptyEditorState, cloneEditorState, editorStateHasDirtySelection,
  LexicalEditor, createEditor, resetEditor,
  COMMAND_PRIORITY_CRITICAL, COMMAND_PRIORITY_EDITOR, COMMAND_PRIORITY_HIGH, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_NORMAL
  // Selection related items removed as they are now in LexicalSelection.ts
};
export type {
  SerializedEditorState, EditorStateReadOptions,
  EditorConfig, Klass, EditorThemeClasses, LexicalCommand, UpdateListenerPayload, RootListener, MutationListener, CommandListener, EditableListener, TextContentListener, DecoratorListener, RegisteredNodes, RegisteredNode, Transform, ErrorHandler, MutatedNodes, NodeMutation, MutationListenerOptions, CommandListenerPriority, CommandPayloadType, Commands, Listeners, SetListeners, TransformerType, DOMConversionCache, SerializedEditor, CreateEditorArgs, HTMLConfig, LexicalNodeConfig, LexicalNodeReplacement, EditorSetOptions, EditorFocusOptions, TextNodeThemeClasses
  // LexicalEditor type itself is exported via class
  // Selection related types removed
};

// Exports from LexicalNode
// LexicalNode class, buildImportMap, and insertRangeAfter are exported by their definitions.
export type {
  NodeKey, NodeMap, SerializedLexicalNode, StaticNodeConfigValue, BaseStaticNodeConfig, StaticNodeConfig,
  AnyStaticNodeConfigValue, StaticNodeConfigRecord, GetStaticNodeType, LexicalExportJSON, LexicalUpdateJSON,
  LexicalPrivateDOM, DOMConversionProp, DOMConversionPropByTagName, DOMConversionTagNameMap, DOMConversion,
  DOMConversionFn, DOMChildConversion, DOMConversionMap, DOMConversionOutput, DOMExportOutputMap, DOMExportOutput
};


// Ensure this file is treated as a module
export {};
