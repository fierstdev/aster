import { defineConfig } from 'vite-plus';
import aster from '@fierst/aster/vite';

export default defineConfig({
  plugins: [aster()],
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
    semi: true,
  },
});
