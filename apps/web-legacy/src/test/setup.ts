/**
 * Vitest setup file for @shipyard/web tests.
 * Loads jest-dom matchers for DOM-specific assertions.
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

expect.extend(matchers);
