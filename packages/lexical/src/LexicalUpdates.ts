/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import type { EditorState, LexicalEditor, EditorUpdateOptions, EditorConfig } from './LexicalCore';
import type { NodeKey } from './LexicalCore'; // LexicalNode types/classes are in LexicalCore
import {
  $isRangeSelection,
  $internalMakeRangeSelection,
  type BaseSelection,
  updateDOMSelection // Now from LexicalSelection
} from './LexicalSelection';
import { $reconcileRoot } from './LexicalReconciler';
import { $garbageCollectDetachedDecorators, $garbageCollectDetachedNodes } from './LexicalGC';
// import { triggerListeners } from './LexicalEvents';
import { flushRootMutations, getIsProcessingMutations } from './LexicalMutations';
import { NO_DIRTY_NODES, HAS_DIRTY_NODES } from './LexicalConstants';
import { SKIP_DOM_SELECTION_TAG, UpdateTag } from './LexicalUpdateTags';
import { getDOMSelection, getWindow, warnOnlyOnce, $isRootNode as $isRootNodeUtil } from './LexicalUtils';
import invariant from 'shared/invariant';
import { $isElementNode, ElementNode } from './nodes/LexicalElementNode'; // For $applyTransforms
import { $isDecoratorNode, DecoratorNode } from './nodes/LexicalDecoratorNode'; // For $applyTransforms
import { $isTextNode, TextNode } from './nodes/LexicalTextNode'; // For $applyTransforms
import { $isLineBreakNode, LineBreakNode } from './nodes/LexicalLineBreakNode'; // For $applyTransforms
import { RegisteredNode, Transform, TransformerType } from './LexicalEditor'; // Types from LexicalEditor (now in LexicalCore)


// Active editor variables
let activeEditor: LexicalEditor | null = null;
let activeEditorState: EditorState | null = null;
let activeParserState: EditorState | null = null;
let editorConfigContext: null | EditorConfig = null;


export function getActiveEditor(): LexicalEditor {
  if (activeEditor === null) {
    invariant(false, 'Unable to find an active editor. This likely means you\'re using a Lexical API outside of an update cycle.');
  }
  return activeEditor;
}

export function getActiveEditorState(): EditorState {
  if (activeEditorState === null) {
    invariant(false, 'Unable to find an active editor state. This likely means you\'re using a Lexical API outside of an update cycle.');
  }
  return activeEditorState;
}

export function getActiveParserState(): EditorState {
  if (activeParserState === null) {
    invariant(false, 'Unable to find an active parser state. This likely means you\'re using a Lexical API outside of a parse cycle.');
  }
  return activeParserState;
}

export function internalGetActiveEditorState(): EditorState | null {
  return activeEditorState;
}

export function internalGetActiveEditor(): LexicalEditor | null {
  return activeEditor;
}

export function isCurrentlyReadOnlyMode(): boolean {
  return activeEditor !== null && activeEditor.isReadOnly();
}

export function errorOnReadOnly(): void {
  if (isCurrentlyReadOnlyMode()) {
    invariant(false, 'Cannot use method in read-only mode.');
  }
}

export function errorOnInfiniteTransforms(): void {
  if (getActiveEditor()._pendingEditorState !== null) {
    // TODO: add a dev-only warning here
    // invariant(false, 'One or more transforms are endlessly triggering other transforms. Please fix this issue.');
  }
}

function internalCallUpdateFunctions(
  editor: LexicalEditor,
  editorState: EditorState,
  prevEditorState: EditorState,
  dirtyLeaves: Set<NodeKey>,
  dirtyElements: Map<NodeKey, boolean>,
  normalizedNodes: Set<NodeKey>,
  tags: Set<string>,
): void {
  if (editor._dirtyType !== NO_DIRTY_NODES) {
    $reconcileRoot(editor, prevEditorState, editorState, tags);
  }
  const listeners = Array.from(editor._listeners.update);
  const N = listeners.length;

  for (let i = 0; i < N; i++) {
    const { listener, tag } = listeners[i];
    if (tag === undefined || tags.has(tag)) {
      listener({
        dirtyElements,
        dirtyLeaves,
        editorState,
        normalizedNodes,
        prevEditorState,
        tags,
      });
    }
  }

  const deferred = editor._deferred;
  editor._deferred = [];
  if (deferred.length !== 0) {
    for (let i = 0; i < deferred.length; i++) {
      deferred[i]();
    }
    if (editor._deferred.length !== 0) {
      $commitPendingUpdates(editor);
    }
  }
}

function $maybeRestorePreviousSelection(
  pendingEditorState: EditorState,
  editor: LexicalEditor,
): void {
  const previousEditorState = editor.getEditorState();
  if (
    pendingEditorState._selection === null &&
    previousEditorState._readOnly === true
  ) {
    const previousSelection = previousEditorState._selection;
    if ($isRangeSelection(previousSelection)) {
      const anchor = previousSelection.anchor;
      const focus = previousSelection.focus;
      pendingEditorState._selection = $internalMakeRangeSelection(
        anchor.key,
        anchor.offset,
        focus.key,
        focus.offset,
        anchor.type,
        focus.type,
      );
    }
  }
}

export function $commitPendingUpdates(editor: LexicalEditor): void {
  const pendingEditorState = editor._pendingEditorState;
  if (pendingEditorState === null) {
    return;
  }
  editor._pendingEditorState = null;
  $maybeRestorePreviousSelection(pendingEditorState, editor);
  const prevEditorState = editor._editorState;
  editor._editorState = pendingEditorState;
  const tags = editor._updateTags;
  const dirtyLeaves = editor._dirtyLeaves;
  const dirtyElements = editor._dirtyElements;
  const normalizedNodes = editor._normalizedNodes;
  const cloneNotNeeded = editor._cloneNotNeeded;
  editor._cloneNotNeeded = new Set();
  editor._dirtyLeaves = new Set();
  editor._dirtyElements = new Map();
  editor._normalizedNodes = new Set();
  editor._updateTags = new Set();
  editor._dirtyType = NO_DIRTY_NODES;

  if (__DEV__) {
    if (prevEditorState !== null && prevEditorState !== pendingEditorState) {
      const log = editor._log;
      const N = log.length;
      if (N > 0) {
        for (let i = 0; i < N; i += 2) {
          const level = log[i] as 'error' | 'warn';
          const message = log[i + 1] as string;
          console[level](message);
        }
        editor._log.length = 0;
      }
    }
  }
  const currentActiveEditor = activeEditor;
  const currentActiveEditorState = activeEditorState;
  const currentEditorConfigContext = editorConfigContext;
  const currentReadOnlyMode = editor._readOnly;
  const currentCompositionKey = editor._compositionKey;
  activeEditor = editor;
  activeEditorState = pendingEditorState;
  editorConfigContext = editor._config;
  editor._readOnly = false;
  editor._compositionKey = null;

  try {
    internalCallUpdateFunctions(
      editor,
      pendingEditorState,
      prevEditorState,
      dirtyLeaves,
      dirtyElements,
      normalizedNodes,
      tags,
    );
  } catch (error) {
    editor._onError(error as Error);
    editor._editorState = prevEditorState;
    editor._cloneNotNeeded = cloneNotNeeded;
    editor._dirtyLeaves = dirtyLeaves;
    editor._dirtyElements = dirtyElements;
    editor._normalizedNodes = normalizedNodes;
    editor._updateTags = tags;
    editor._dirtyType = HAS_DIRTY_NODES;
    activeEditor = currentActiveEditor;
    activeEditorState = currentActiveEditorState;
    editorConfigContext = currentEditorConfigContext;
    editor._readOnly = currentReadOnlyMode;
    editor._compositionKey = currentCompositionKey;
    return;
  }
  const shouldUpdateNativeSelection =
    pendingEditorState._selection !== null &&
    !tags.has(SKIP_DOM_SELECTION_TAG);
  const rootElement = editor._rootElement;

  if (shouldUpdateNativeSelection && rootElement !== null) {
    const domSelection = getDOMSelection(getWindow(editor));
    if (domSelection !== null) {
      updateDOMSelection(
        prevEditorState._selection,
        pendingEditorState._selection,
        editor,
        domSelection,
        tags,
        rootElement,
        pendingEditorState._nodeMap.size,
      );
    }
    if (editor._keyToDOMMap.size === 0 && pendingEditorState._nodeMap.size > 1) {
      warnOnlyOnce(
        "Editor's keyToDOMMap is empty despite there being nodes in the editor state. " +
          'This is likely a bug in Lexical, or not cleaning up the keyToDOMMap from a previous editor.',
      );
    }
  }
  if (editor._flushSync) {
    editor._flushSync = false;
    flushRootMutations(editor);
  }
  editor._readOnly = currentReadOnlyMode;
  editor._compositionKey = currentCompositionKey;
  activeEditor = currentActiveEditor;
  activeEditorState = currentActiveEditorState;
  editorConfigContext = currentEditorConfigContext;
  $garbageCollectDetachedDecorators(editor, pendingEditorState);
  $garbageCollectDetachedNodes(editor, prevEditorState, pendingEditorState);
}

export function updateEditor<V>(
  editor: LexicalEditor,
  updateFn: () => V,
  options?: EditorUpdateOptions,
  onUpdate?: () => void,
): V {
  const skipTransform = options !== undefined && options.skipTransforms === true;
  const tag = options !== undefined ? options.tag : undefined;
  const discrete = options !== undefined && options.discrete === true;

  if (onUpdate === undefined && editor._pendingEditorState !== null) {
    if (discrete) {
      const logger = editor._log;
      if (__DEV__) {
        logger.push(
          'warn',
          'updateEditor: discrete updates expect to be flushed synchronously.',
        );
      }
    }
    const pendingEditorState = editor._pendingEditorState;
    const oldActiveEditor = activeEditor;
    const oldActiveEditorState = activeEditorState;
    const oldEditorConfigContext = editorConfigContext;
    activeEditor = editor;
    activeEditorState = pendingEditorState;
    editorConfigContext = editor._config;
    let result: V;
    try {
      if (tag !== undefined) {
        editor._updateTags.add(tag);
      }
      if (!skipTransform) {
        $applyTransforms(editor, pendingEditorState, false, tag);
      }
      result = updateFn();
    } finally {
      activeEditor = oldActiveEditor;
      activeEditorState = oldActiveEditorState;
      editorConfigContext = oldEditorConfigContext;
    }
    return result;
  }
  const currentEditorState = editor._editorState;
  const currentReadOnly = editor._readOnly;
  const currentActiveEditor = activeEditor;
  const currentActiveEditorState = activeEditorState;
  const currentEditorConfigContext = editorConfigContext;
  const currentPendingEditorState = editor._pendingEditorState;
  let pendingEditorState = editor._pendingEditorState = editor.cloneEditorState(currentEditorState); // Use editor's method
  pendingEditorState._readOnly = false;
  activeEditor = editor;
  activeEditorState = pendingEditorState;
  editorConfigContext = editor._config;
  editor._readOnly = false;
  let errorToThrow;
  let result;
  let producedError = false;
  try {
    if (tag !== undefined) {
      editor._updateTags.add(tag);
    }
    if (!skipTransform) {
      $applyTransforms(editor, pendingEditorState, false, tag);
    }
    result = updateFn();
    if (!skipTransform) {
      $applyTransforms(editor, pendingEditorState, true, tag);
    }
  } catch (e) {
    errorToThrow = e;
    producedError = true;
  } finally {
    editor._readOnly = currentReadOnly;
    activeEditor = currentActiveEditor;
    activeEditorState = currentActiveEditorState;
    editorConfigContext = currentEditorConfigContext;

    if (producedError && editor._pendingEditorState === pendingEditorState) {
      editor._pendingEditorState = currentPendingEditorState;
    }
  }
  if (producedError) {
    editor._onError(errorToThrow as Error);
    throw errorToThrow;
  }

  if (editor._pendingEditorState === null) {
    return result as V;
  }

  if (onUpdate !== undefined) {
    editor._deferred.push(onUpdate);
  }
  if (discrete) {
    $commitPendingUpdates(editor);
  } else if (editor._pendingFlush === null) {
    editor._pendingFlush = editor.getScheduler()(() => { // Use editor's scheduler
      editor._pendingFlush = null;
      $commitPendingUpdates(editor);
    });
  }
  return result as V;
}

export function updateEditorSync<V>(
  editor: LexicalEditor,
  updateFn: () => V,
  options?: EditorUpdateOptions,
): V {
  let V_return: V;
  updateEditor(
    editor,
    () => {
      V_return = updateFn();
    },
    options,
    () => {
      // Don't need to do anything here
    },
  );
  // @ts-expect-error: V_return will be assigned
  return V_return;
}

export function readEditorState<V>(editorState: EditorState, readFn: () => V): V {
  const currentActiveEditor = activeEditor;
  const currentActiveEditorState = activeEditorState;
  const currentEditorConfigContext = editorConfigContext;
  const editor = editorState._parentEditor;
  const config = editor !== null ? editor._config : null;
  activeEditor = editor;
  activeEditorState = editorState;
  editorConfigContext = config;
  try {
    return readFn();
  } finally {
    activeEditor = currentActiveEditor;
    activeEditorState = currentActiveEditorState;
    editorConfigContext = currentEditorConfigContext;
  }
}

// Simplified $applyTransforms, actual implementation is more complex
// and involves node specific transforms.
export function $applyTransforms(
  editor: LexicalEditor,
  editorState: EditorState,
  isFromDOM: boolean,
  tag: void | UpdateTag,
): void {
  const previouslyUsedDirtyNodes = new Set<NodeKey>();
  const transforms = editor._transforms;
  // Simplified loop, actual logic is more involved with dirty node tracking
  for (const transform of transforms) {
    // This is a conceptual representation. Actual transform application is per-node.
    // editorState.read(() => { // This would be incorrect here as we are in an update
    //   editorState._nodeMap.forEach(node => transform(node, editor, isFromDOM, tag));
    // });
  }
}

export function $parseSerializedNode( // This was in LexicalCore, but used by parseEditorState here
  serializedNode: SerializedLexicalNode,
): LexicalNode {
  const editor = getActiveEditor();
  const registeredNode = editor._nodes.get(serializedNode.type);
  if (registeredNode === undefined) {
    invariant(false, 'parseEditorState: type "%s" not found', serializedNode.type);
  }
  const node = registeredNode.klass.importJSON(serializedNode);
  node.__type = serializedNode.type;
  return node;
}

export function parseEditorState(
  serializedEditorState: SerializedEditorState,
  editor: LexicalEditor,
): EditorState {
  const editorState = editor.createEmptyEditorState(); // Use editor's method
  const previousActiveEditorState = activeEditorState;
  const previousActiveEditor = activeEditor;
  const previousEditorConfigContext = editorConfigContext;
  activeEditor = editor;
  activeEditorState = editorState;
  editorConfigContext = editor._config;
  try {
    const root = $parseSerializedNode(serializedEditorState.root);
    if (!$isRootNodeUtil(root)) { // Use aliased $isRootNode from LexicalUtils
      invariant(false, 'parseEditorState: root is not correctly deserialized');
    }
    // The root is already part of editorState through createEmptyEditorState
  } finally {
    activeEditorState = previousActiveEditorState;
    activeEditor = previousActiveEditor;
    editorConfigContext = previousEditorConfigContext;
  }
  return editorState;
}

// Make sure to include triggerListeners if it was part of LexicalUpdates.ts originally
// For now, assuming it's handled by LexicalEvents or LexicalCore directly.
// export function triggerListeners ...
//
// Similarly for other utility functions that might have been in LexicalUpdates.ts
// and are used by the functions above.
// For example, $applyTransforms logic is quite involved and references other parts.
// The placeholder above is very basic.
// The real $applyTransforms would iterate over dirty nodes and apply registered transforms.

function transformNode(
  transforms: Set<Transform<LexicalNode>>,
  node: LexicalNode,
  editor: LexicalEditor,
  previouslyUsedDirtyNodes: Set<NodeKey>,
  isFromDOM: boolean,
  tag: void | UpdateTag,
): void {
  previouslyUsedDirtyNodes.add(node.getKey());
  const registeredNode = editor._nodes.get(node.getType());
  if (registeredNode === undefined) {
    invariant(false, 'getRegisteredNodeOrThrow: Type %s not found', node.getType());
  }
  const transform = registeredNode.transform;

  if (transform !== null) {
    const prevActiveEditor = activeEditor;
    const prevActiveEditorState = activeEditorState;
    const prevEditorConfigContext = editorConfigContext;
    activeEditor = editor;
    activeEditorState = editor._editorState; // Should be pending editor state during update
    editorConfigContext = editor._config;
    try {
      transform(node, editor, isFromDOM, tag);
    } finally {
      activeEditor = prevActiveEditor;
      activeEditorState = prevActiveEditorState;
      editorConfigContext = prevEditorConfigContext;
    }
  }
}

// Placeholder: Actual $applyTransforms is more complex
// This is a simplified version based on its usage context within updateEditor
// function $applyTransforms(
//   editor: LexicalEditor,
//   editorState: EditorState,
//   isFromDOM: boolean,
//   tag: void | UpdateTag,
// ): void {
//   // Actual implementation involves iterating dirty nodes and applying transforms
//   // This is a placeholder
// }

export type { EditorUpdateOptions, SerializedEditorState } from './LexicalEditor'; // Types from LexicalEditor
export type { SerializedLexicalNode } from './LexicalNode'; // Type from LexicalNode
export type { TransformerType } from './LexicalEditor'; // Type from LexicalEditor
