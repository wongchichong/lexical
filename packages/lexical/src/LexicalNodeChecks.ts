/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { LexicalNode } from './LexicalNode';
import { TextNode } from './nodes/LexicalTextNode';
import { ElementNode } from './nodes/LexicalElementNode';
import { LineBreakNode } from './nodes/LexicalLineBreakNode';
import { DecoratorNode } from './nodes/LexicalDecoratorNode';
import { RootNode } from './nodes/LexicalRootNode';
import { ParagraphNode } from './nodes/LexicalParagraphNode';
import { TabNode } from './nodes/LexicalTabNode';
// Import other specific node classes as their type guards are added

export function $isTextNode(
  node: LexicalNode | null | undefined,
): node is TextNode {
  return node instanceof TextNode;
}

export function $isElementNode(
  node: LexicalNode | null | undefined,
): node is ElementNode {
  return node instanceof ElementNode;
}

export function $isLineBreakNode(
  node: LexicalNode | null | undefined,
): node is LineBreakNode {
  return node instanceof LineBreakNode;
}

export function $isDecoratorNode(
  node: LexicalNode | null | undefined,
): node is DecoratorNode<unknown> {
  return node instanceof DecoratorNode;
}

export function $isRootNode(
  node: LexicalNode | null | undefined,
): node is RootNode {
  return node instanceof RootNode;
}

export function $isParagraphNode(
  node: LexicalNode | null | undefined,
): node is ParagraphNode {
  return node instanceof ParagraphNode;
}

export function $isTabNode(
  node: LexicalNode | null | undefined,
): node is TabNode {
  return node instanceof TabNode;
}

// Add other $isSpecificNode functions here as needed.
