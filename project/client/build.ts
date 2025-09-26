import { spawn } from 'child_process'
import esbuild, { BuildOptions } from 'esbuild'
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const isDev = process.argv.includes('--dev')
const isPreview = process.argv.includes('--preview')

const buildOptions = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    outdir: 'dist',
    sourcemap: isDev,
    minify: !isDev,
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    loader: {
        '.png': 'file',
        '.jpg': 'file',
        '.jpeg': 'file',
        '.svg': 'file',
        '.gif': 'file',
        '.css': 'css'
    },
    define: {
        'process.env.NODE_ENV': isDev ? '"development"' : '"production"'
    },
    external: []
}

function copyPublicAssets() {
    const assetsDir = 'assets'

    if (!existsSync(assetsDir)) {
        return
    }

    function copyRecursive(src: string, dest: string) {
        const stat = statSync(src)

        if (stat.isDirectory()) {
            if (!existsSync(dest)) {
                mkdirSync(dest, { recursive: true })
            }

            const files = readdirSync(src)
            files.forEach(file => {
                copyRecursive(join(src, file), join(dest, file))
            })
        } else {
            copyFileSync(src, dest)
        }
    }

    const files = readdirSync(assetsDir)
    files.forEach(file => {
        copyRecursive(join(assetsDir, file), file)
    })
}

async function build() {
    try {
        copyPublicAssets()

        if (isDev) {
            const context = await esbuild.context(buildOptions as BuildOptions)
            await context.watch()
            console.log('👀 Watching for changes...')

            const server = spawn('npx', ['live-server', '.', '--port=5173'], {
                stdio: 'inherit',
                shell: true
            })

            console.log('🚀 Dev server running at http://localhost:5173')

            process.on('SIGINT', () => {
                server.kill()
                context.dispose()
                process.exit(0)
            })

        } else if (isPreview) {
            await esbuild.build(buildOptions as BuildOptions)
            console.log('✅ Build complete')

            const server = spawn('npx', ['live-server', '.', '--port=5173'], {
                stdio: 'inherit',
                shell: true
            })

            console.log('🚀 Preview server running at http://localhost:5173')

        } else {
            await esbuild.build(buildOptions as BuildOptions)
            console.log('✅ Production build complete')
        }

    } catch (error) {
        console.error('❌ Build failed:', error)
        process.exit(1)
    }
}

build()