import path from 'path';
import { defineConfig, normalizePath } from 'vite';
import { ViteEjsPlugin } from 'vite-plugin-ejs';

import { version } from './package.json';
import { createReactPlugin } from './vite.react-plugin';

export default defineConfig({
    build: {
        cssMinify: 'esbuild',
        emptyOutDir: true,
        minify: 'esbuild',
        outDir: path.resolve(__dirname, './out/party'),
        rollupOptions: {
            input: {
                favicon: normalizePath(path.resolve(__dirname, './assets/icons/favicon.ico')),
                index: normalizePath(path.resolve(__dirname, './src/party/index.html')),
                party: normalizePath(path.resolve(__dirname, './src/party/index.tsx')),
            },
            output: {
                assetFileNames: '[name].[ext]',
                chunkFileNames: '[name].js',
                entryFileNames: '[name].js',
                sourcemapExcludeSources: true,
            },
        },
        sourcemap: false,
    },
    css: {
        modules: {
            generateScopedName: 'fs-[name]-[local]',
            localsConvention: 'camelCase',
        },
    },
    plugins: [
        createReactPlugin(),
        ViteEjsPlugin({
            prod: process.env.NODE_ENV === 'production',
            root: normalizePath(path.resolve(__dirname, './src/party')),
            version,
        }),
    ],
    resolve: {
        alias: {
            '/@/party': path.resolve(__dirname, './src/party'),
            '/@/shared': path.resolve(__dirname, './src/shared'),
        },
    },
    root: path.resolve(__dirname, './src/party'),
});
