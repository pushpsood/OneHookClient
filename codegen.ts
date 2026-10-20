import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  overwrite: true,
  schema: '../OneHookBackend/packages/api-models/model/schema.graphql',
  documents: 'src/**/*.graphql',
  generates: {
    'src/graphql/generated/': {
      preset: 'client',
      plugins: []
    }
  }
};

export default config;
