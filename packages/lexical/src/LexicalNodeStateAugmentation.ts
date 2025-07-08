/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { LexicalEditor } from './LexicalEditor';
import type { LexicalNode } from './LexicalNode';
import type { NodeState, StateConfig, ValueOrUpdater } from './LexicalNodeState';
import { $getSharedNodeState, NodeState as NodeStateClass, $getState as getNodeStateAliased, $checkCollision as checkNodeCollisionAliased } from './LexicalNodeState';
import { errorOnReadOnly, getActiveEditor } from './LexicalUpdates';

/**
 * @internal
 *
 * Only for direct use in very advanced integrations, such as lexical-yjs.
 * Typically you would only use {@link createState}, {@link $getState}, and
 * {@link $setState}. This is effectively the preamble for {@link $setState}.
 */
export function $getWritableNodeState<T extends LexicalNode>(
  node: T,
): NodeState<T> {
  const writable = node.getWritable();
  const editor = getActiveEditor();
  const state = writable.__state
    ? writable.__state.getWritable(writable)
    : new NodeStateClass(writable, $getSharedNodeState(writable, editor));
  writable.__state = state;
  return state;
}

/**
 * Set the state defined by stateConfig on node. Like with `React.useState`
 * you may directly specify the value or use an updater function that will
 * be called with the previous value of the state on that node (which will
 * be the `stateConfig.defaultValue` if not set).
 *
 * When an updater function is used, the node will only be marked dirty if
 * `stateConfig.isEqual(prevValue, value)` is false.
 *
 * @param node The LexicalNode to set the state on
 * @param stateConfig The configuration for this state
 * @param valueOrUpdater The value or updater function
 * @returns node
 */
export function $setState<Node extends LexicalNode, K extends string, V>(
  node: Node,
  stateConfig: StateConfig<K, V>,
  valueOrUpdater: ValueOrUpdater<V>,
): Node {
  errorOnReadOnly();
  let value: V;

  if (typeof valueOrUpdater === 'function') {
    const latest = node.getLatest();
    const prevValue = getNodeStateAliased(latest, stateConfig);
    value = (valueOrUpdater as (v: V) => V)(prevValue);
    if (stateConfig.isEqual(prevValue, value)) {
      return latest;
    }
  } else {
    value = valueOrUpdater;
  }
  const writable = node.getWritable();
  const state = $getWritableNodeState(writable);

  checkNodeCollisionAliased(node, stateConfig, state);

  state.updateFromKnown(stateConfig, value);
  return writable;
}
