import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config({ignores:['dist','node_modules','playwright-report','test-results']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.ts','**/*.tsx'],plugins:{'react-hooks':hooks},rules:{'react-hooks/rules-of-hooks':'error','@typescript-eslint/no-explicit-any':'off'}},{files:['**/*.mjs','**/*.js'],languageOptions:{globals:{document:'readonly',innerWidth:'readonly',process:'readonly',console:'readonly',fetch:'readonly',URL:'readonly',URLSearchParams:'readonly',AbortSignal:'readonly',Buffer:'readonly'}}});
