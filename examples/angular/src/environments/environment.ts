export const environment = {
  production: false,
  /**
   * Replace with your Brevwick project key (from https://brevwick.dev).
   * Angular CLI does not expose a built-in `import.meta.env`-style mechanism;
   * the environment files + `fileReplacements` in `angular.json` are the
   * canonical pattern.
   */
  brevwickProjectKey: 'pk_test_replace_me',
  /**
   * Local-stack endpoint. Leave empty to fall through to the SDK's default,
   * but the example fails closed: an empty endpoint surfaces a friendly
   * banner instead of letting traffic leak to production.
   */
  brevwickEndpoint: 'http://localhost:8080',
};
