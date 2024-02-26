
import Path from 'path'
import Fs from 'fs/promises'
//import {sassPlugin} from 'esbuild-sass-plugin'
import { spawn } from '../rqe/node/shell'
import { randomHex } from '../rqe';

interface ProjectConfig {
    projectName: string
    buildId?: string
}

function basePath(path) {
    return Path.resolve(__dirname, '../..', path);
}

function webPath(path) {
    return Path.resolve(__dirname, '../../web', path);
}

function log(s: string) {
    console.log((new Date()).toISOString().slice(11,19), s);
}

function generateBuildId(project: ProjectConfig) {
    return project.projectName + '-' + (new Date()).toISOString().substring(0, 10) + '-' + randomHex(10);
}

async function shell(cmd: string, options: any = {}) {

    options.cwd = options.cwd || basePath('.');

    const { output } = spawn(cmd, options);

    for await (const item of output) {
        switch (item.t) {
            case 'stdout':
            case 'stderr':
                console.log(item.line)
        }
    }
}

async function runEsbuild(config: ProjectConfig) {
    let esbuild = require('esbuild');

    await esbuild.build({
        entryPoints: [
            basePath('src/extension-background/backgroundMain.ts'),
            basePath('src/extension-content/contentMain.ts'),
            basePath('src/extension-inject/injectMain.ts'),
        ],
        // plugins: [ sassPlugin() ],
        sourcemap: 'external',
        bundle: true,
        platform: 'browser',
        define: {
            'process.env.BUILD_TARGET': '"chrome-extension"',
            'process.env.BUILD_ID': JSON.stringify(config.buildId),
        },
        outdir: basePath('chrome-extension/dist'),
    });
}

export async function buildExtension({}: any = {}) {
    const config: ProjectConfig = { projectName: 'mercury' };

    config.buildId = generateBuildId(config);

    log(`# starting buildExtension, build ID = ${config.buildId}`);

    // Clear old artifacts
    log(`# cleaning old artifacts..`)
    await shell('rm -rf chrome-extension/dist');
    await shell('rm -rf chrome-extension/assets');
    // await shell('rm -rf chrome-extension/popup.html');
    // await shell('rm -rf web/dist/assets');

    // Prepare destination
    await shell(`mkdir -p chrome-extension/assets`);

    log('# running ESBuild..');
    await runEsbuild(config);

    // Run the Vite build
    /*
    log('# running web build..');
    // await shell('rm -rf out');
    await shell('cp src/extension/popup.html index.html');
    await shell('yarn build', {
        env: {
            //NODE_ENV: 'production',
            BUILD_TARGET: 'chrome-extension',
        }
    });
    await shell('yarn build');
    */

    await Fs.writeFile(basePath('chrome-extension/dist/buildReport.json'), JSON.stringify(config));

    log('finished buildExtension');
}

if (!module.parent) {
    buildExtension()
    .catch(e => {
        process.exitCode = -1;
        console.error(e);
    })
}
