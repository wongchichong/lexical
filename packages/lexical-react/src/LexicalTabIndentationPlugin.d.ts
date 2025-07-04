/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { LexicalEditor } from 'lexical';
export declare function registerTabIndentation(editor: LexicalEditor, maxIndent?: number): () => void;
/**
 * This plugin adds the ability to indent content using the tab key. Generally, we don't
 * recommend using this plugin as it could negatively affect accessibility for keyboard
 * users, causing focus to become trapped within the editor.
 */
export declare function TabIndentationPlugin({ maxIndent }: {
    maxIndent?: number;
}): null;
//# sourceMappingURL=LexicalTabIndentationPlugin.d.ts.map