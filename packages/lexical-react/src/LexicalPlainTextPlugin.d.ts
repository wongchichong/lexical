/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import type { JSX } from 'react';
import { ErrorBoundaryType } from './shared/useDecorators';
export declare function PlainTextPlugin({ contentEditable, placeholder, ErrorBoundary, }: {
    contentEditable: JSX.Element;
    placeholder?: ((isEditable: boolean) => null | JSX.Element) | null | JSX.Element;
    ErrorBoundary: ErrorBoundaryType;
}): JSX.Element;
//# sourceMappingURL=LexicalPlainTextPlugin.d.ts.map