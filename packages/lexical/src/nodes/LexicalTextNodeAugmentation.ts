/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { RangeSelection } from '../LexicalSelection';
import { TextNode as TextNodeClass } from './LexicalTextNode'; // Import actual class
import { errorOnReadOnly } from '../LexicalUpdates';
import { $getSelection, $internalMakeRangeSelection, $isRangeSelection } from '../LexicalSelection'; // $isRangeSelection needed for type check
import { $getCompositionKey, $setCompositionKey } from '../LexicalUtils';

// Augment TextNode
declare module './LexicalTextNode' {
  interface TextNode {
    setTextContent(text: string): this;
    select(_anchorOffset?: number, _focusOffset?: number): RangeSelection;
  }
}

TextNodeClass.prototype.setTextContent = function(text: string): typeof TextNodeClass.prototype {
  // Note: this.__text is defined on the TextNodeClass directly.
  // getWritable() is already augmented onto LexicalNode.prototype and handles marking dirty.
  if (this.__text === text) {
    return this;
  }
  const self = this.getWritable();
  self.__text = text;
  return self;
};

TextNodeClass.prototype.select = function(_anchorOffset?: number, _focusOffset?: number): RangeSelection {
  errorOnReadOnly();
  let anchorOffset = _anchorOffset;
  let focusOffset = _focusOffset;
  const selection = $getSelection();
  const text = this.getTextContent();
  const key = this.__key;

  if (typeof text === 'string') {
    const lastOffset = text.length;
    if (anchorOffset === undefined) {
      anchorOffset = lastOffset;
    }
    if (focusOffset === undefined) {
      focusOffset = lastOffset;
    }
  } else {
    anchorOffset = 0;
    focusOffset = 0;
  }
  // Need to check if $isRangeSelection is available or needs import
  if (!$isRangeSelection(selection)) {
    return $internalMakeRangeSelection(
      key,
      anchorOffset,
      key,
      focusOffset,
      'text',
      'text',
    );
  } else {
    const compositionKey = $getCompositionKey();
    if (
      compositionKey === selection.anchor.key ||
      compositionKey === selection.focus.key
    ) {
      $setCompositionKey(key);
    }
    // setTextNodeRange is a method of RangeSelection, so this is fine.
    selection.setTextNodeRange(this, anchorOffset, this, focusOffset);
  }
  return selection;
};
