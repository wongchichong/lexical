/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

export type {
  BaseCaret,
  CaretDirection,
  CaretRange,
  CaretType,
  ChildCaret,
  CommonAncestorResult,
  CommonAncestorResultAncestor,
  CommonAncestorResultBranch,
  CommonAncestorResultDescendant,
  CommonAncestorResultSame,
  FlipDirection,
  NodeCaret,
  PointCaret,
  RootMode,
  SiblingCaret,
  StepwiseIteratorConfig,
  TextPointCaret,
  TextPointCaretSlice,
  TextPointCaretSliceTuple,
} from './caret/LexicalCaret'
export {
  $comparePointCaretNext,
  $extendCaretToRange,
  $getAdjacentChildCaret,
  $getCaretRange,
  $getChildCaret,
  $getChildCaretOrSelf,
  $getCollapsedCaretRange,
  $getCommonAncestor,
  $getCommonAncestorResultBranchOrder,
  $getSiblingCaret,
  $getTextNodeOffset,
  $getTextPointCaret,
  $getTextPointCaretSlice,
  $isChildCaret,
  $isNodeCaret,
  $isSiblingCaret,
  $isTextPointCaret,
  $isTextPointCaretSlice,
  flipDirection,
  makeStepwiseIterator,
} from './caret/LexicalCaret'
export {
  $caretFromPoint,
  $caretRangeFromSelection,
  $getAdjacentSiblingOrParentSiblingCaret,
  $getCaretInDirection,
  $getCaretRangeInDirection,
  $getChildCaretAtIndex,
  $isExtendableTextPointCaret,
  $normalizeCaret,
  $removeTextFromCaretRange,
  $rewindSiblingCaret,
  $setPointFromCaret,
  $setSelectionFromCaretRange,
  $splitAtPointCaretNext,
  $updateRangeSelectionFromCaretRange,
  type SplitAtPointCaretNextOptions,
} from './caret/LexicalCaretUtils'
export {
  BLUR_COMMAND,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CLEAR_EDITOR_COMMAND,
  CLEAR_HISTORY_COMMAND,
  CLICK_COMMAND,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  COPY_COMMAND,
  createCommand,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  DRAGEND_COMMAND,
  DRAGOVER_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  FOCUS_COMMAND,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  INSERT_TAB_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  KEY_MODIFIER_COMMAND,
  KEY_SPACE_COMMAND,
  KEY_TAB_COMMAND,
  MOVE_TO_END,
  MOVE_TO_START,
  OUTDENT_CONTENT_COMMAND,
  PASTE_COMMAND,
  type PasteCommandType,
  REDO_COMMAND,
  REMOVE_TEXT_COMMAND,
  SELECT_ALL_COMMAND,
  SELECTION_CHANGE_COMMAND,
  SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  UNDO_COMMAND,
} from './LexicalCommands'
export {
  IS_ALL_FORMATTING,
  IS_BOLD,
  IS_CODE,
  IS_HIGHLIGHT,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
  NODE_STATE_KEY,
  TEXT_TYPE_TO_FORMAT,
} from './LexicalConstants'
export type {
  CommandListener,
  CommandListenerPriority,
  CommandPayloadType,
  CreateEditorArgs,
  EditableListener,
  EditorConfig,
  EditorSetOptions,
  EditorThemeClasses,
  EditorThemeClassName,
  EditorUpdateOptions,
  HTMLConfig,
  Klass,
  KlassConstructor,
  LexicalCommand,
  LexicalEditor,
  LexicalNodeConfig,
  LexicalNodeReplacement,
  MutationListener,
  NodeMutation,
  RootListener,
  SerializedEditor,
  Spread,
  Transform,
  UpdateListener,
  UpdateListenerPayload,
} from './LexicalEditor'
export {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  COMMAND_PRIORITY_NORMAL,
  createEditor,
} from './LexicalEditor'
export type {
  EditorState,
  EditorStateReadOptions,
  SerializedEditorState,
} from './LexicalEditorState'
export type { EventHandler } from './LexicalEvents'
export type {
  BaseStaticNodeConfig,
  DOMChildConversion,
  DOMConversion,
  DOMConversionFn,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  DOMExportOutputMap,
  LexicalExportJSON,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  NodeMap,
  SerializedLexicalNode,
  StaticNodeConfig,
  StaticNodeConfigRecord,
  StaticNodeConfigValue,
} from './LexicalNode'
export { buildImportMap } from './LexicalNode'
export {
  $getState,
  $getStateChange,
  // $getWritableNodeState, // Removed from here
  // $setState,             // Removed from here
  type AnyStateConfig,
  createSharedNodeState,
  createState,
  type NodeStateJSON,
  type StateConfig,
  type StateConfigKey,
  type StateConfigValue,
  type StateValueConfig,
  type StateValueOrUpdater,
  type ValueOrUpdater,
} from './LexicalNodeState'

export {
  $getWritableNodeState,
  $setState,
} from './LexicalNodeStateAugmentation' // Added new export
export { $normalizeSelection as $normalizeSelection__EXPERIMENTAL } from './LexicalNormalization'
export type {
  BaseSelection,
  ElementPointType as ElementPoint,
  NodeSelection,
  Point,
  PointType,
  RangeSelection,
  TextPointType as TextPoint,
} from './LexicalSelection'
export {
  $createNodeSelection,
  $createPoint,
  $createRangeSelection,
  $createRangeSelectionFromDom,
  $getCharacterOffsets,
  $getPreviousSelection,
  $getSelection,
  $getTextContent,
  $insertNodes,
  $isBlockElementNode,
  $isNodeSelection,
  $isRangeSelection,
} from './LexicalSelection'
export { $parseSerializedNode, isCurrentlyReadOnlyMode } from './LexicalUpdates'
export {
  $addUpdateTag,
  $applyNodeReplacement,
  $cloneWithProperties,
  $copyNode,
  $create,
  $getAdjacentNode,
  $getEditor,
  $getNearestNodeFromDOMNode,
  $getNearestRootOrShadowRoot,
  $getNodeByKey,
  $getNodeByKeyOrThrow,
  $getRoot,
  $hasAncestor,
  $hasUpdateTag,
  $isInlineElementOrDecoratorNode,
  $isLeafNode,
  $isRootOrShadowRoot,
  $isTokenOrSegmented,
  $isTokenOrTab,
  $nodesOfType,
  $onUpdate,
  $selectAll,
  $setCompositionKey,
  $setSelection,
  $splitNode,
  getDOMOwnerDocument,
  getDOMSelection,
  getDOMSelectionFromTarget,
  getDOMTextNode,
  getEditorPropertyFromDOMNode,
  getNearestEditorFromDOMNode,
  getRegisteredNode,
  getRegisteredNodeOrThrow,
  INTERNAL_$isBlock,
  isBlockDomNode,
  isDocumentFragment,
  isDOMDocumentNode,
  isDOMNode,
  isDOMTextNode,
  isDOMUnmanaged,
  isExactShortcutMatch,
  isHTMLAnchorElement,
  isHTMLElement,
  isInlineDomNode,
  // isLexicalEditor, // Removed: isLexicalEditor is now a static method LexicalEditor.isLexicalEditor
  isModifierMatch,
  isSelectionCapturedInDecoratorInput,
  isSelectionWithinEditor,
  removeFromParent,
  resetRandomKey,
  setDOMUnmanaged,
  setNodeIndentFromDOM,
} from './LexicalUtils'
export { ArtificialNode__DO_NOT_USE } from './nodes/ArtificialNode'
export { DecoratorNode } from './nodes/LexicalDecoratorNode' // $isDecoratorNode moved
export type {
  ElementDOMSlot,
  ElementFormatType,
  SerializedElementNode,
} from './nodes/LexicalElementNode'
export { ElementNode } from './nodes/LexicalElementNode' // $isElementNode moved
export type { SerializedLineBreakNode } from './nodes/LexicalLineBreakNode'
export {
  $createLineBreakNode,
  LineBreakNode,
} from './nodes/LexicalLineBreakNode' // $isLineBreakNode moved
export type { SerializedParagraphNode } from './nodes/LexicalParagraphNode'
export {
  $createParagraphNode,
  ParagraphNode,
} from './nodes/LexicalParagraphNode' // $isParagraphNode moved
export type { SerializedRootNode } from './nodes/LexicalRootNode'
export { RootNode } from './nodes/LexicalRootNode' // $isRootNode moved
export type { SerializedTabNode } from './nodes/LexicalTabNode'
export { $createTabNode, TabNode } from './nodes/LexicalTabNode' // $isTabNode moved
export type {
  SerializedTextNode,
  TextFormatType,
  TextModeType,
} from './nodes/LexicalTextNode'
export { $createTextNode, TextNode } from './nodes/LexicalTextNode' // $isTextNode moved

// Export type guards from LexicalNodeChecks
export {
  $isDecoratorNode,
  $isElementNode,
  $isLineBreakNode,
  $isParagraphNode,
  $isRootNode,
  $isTabNode,
  $isTextNode
} from './LexicalNodeChecks'

// Update Tags
export {
  COLLABORATION_TAG,
  HISTORIC_TAG,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  PASTE_TAG,
  SKIP_COLLAB_TAG,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
  type UpdateTag,
} from './LexicalUpdateTags'
