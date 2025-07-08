/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { RangeSelection } from '../LexicalSelection';
import { ElementNode as ElementNodeClass } from './LexicalElementNode';
// TextNode type for instanceof check if needed, or rely on $isTextNode
import { TextNode } from './LexicalTextNode';
import { errorOnReadOnly } from '../LexicalUpdates';
import { $getSelection, $internalMakeRangeSelection, $isRangeSelection } from '../LexicalSelection';
import { $isTextNode, $isElementNode } from '../LexicalNodeChecks';

// Augment ElementNode
declare module './LexicalElementNode' {
  interface ElementNode {
    select(_anchorOffset?: number, _focusOffset?: number): RangeSelection;
  }
}

ElementNodeClass.prototype.select = function(_anchorOffset?: number, _focusOffset?: number): RangeSelection {
  errorOnReadOnly();
  const selection = $getSelection();
  let anchorOffset = _anchorOffset;
  let focusOffset = _focusOffset;
  const childrenCount = this.getChildrenSize(); // Own method

  if (!this.canBeEmpty()) { // Own method
    if (_anchorOffset === 0 && _focusOffset === 0) {
      const firstChild = this.getFirstChild(); // Own method
      // Need to check if firstChild is TextNode or ElementNode before calling select
      // $isTextNode and $isElementNode are from LexicalNodeChecks
      if ($isTextNode(firstChild) || $isElementNode(firstChild)) {
         // firstChild could be various node types, ensure it has select.
         // This check might be too loose, relies on TextNode/ElementNode having select.
        if (typeof (firstChild as any).select === 'function') {
            return (firstChild as any).select(0, 0);
        }
      }
    } else if (
      (_anchorOffset === undefined || _anchorOffset === childrenCount) &&
      (_focusOffset === undefined || _focusOffset === childrenCount)
    ) {
      const lastChild = this.getLastChild(); // Own method
      if ($isTextNode(lastChild) || $isElementNode(lastChild)) {
        // Similar check for lastChild
        if (typeof (lastChild as any).select === 'function') {
            return (lastChild as any).select();
        }
      }
    }
  }

  if (anchorOffset === undefined) {
    anchorOffset = childrenCount;
  }
  if (focusOffset === undefined) {
    focusOffset = childrenCount;
  }
  const key = this.__key;
  if (!$isRangeSelection(selection)) {
    return $internalMakeRangeSelection(
      key,
      anchorOffset,
      key,
      focusOffset,
      'element',
      'element',
    );
  } else {
    selection.anchor.set(key, anchorOffset, 'element');
    selection.focus.set(key, focusOffset, 'element');
    selection.dirty = true;
  }
  return selection;
};
