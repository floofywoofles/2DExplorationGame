import minimist from "minimist";
import zod from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const args = minimist(process.argv.slice(2));

const schema = zod.object({
    input: zod.string().min(1).describe("The input file to build"),
    // platform: zod.enum(["darwin", "linux", "windows"]),
    // arch: zod.enum(["arm64", "x64"]),
    output: zod.string().min(1).describe("The output file to build"),
});

const result = schema.parse(args);

try {
    await execAsync("mkdir -p ./build");
    console.log("✓ Created build directory");
    
    await execAsync(`bun build ${result.input} --compile --outfile ./build/${result.output}`);
    console.log("✓ Compiled executable");
    
    if (process.platform === "darwin" || process.platform === "linux") {
        await execAsync(`strip ./build/${result.output}`);
        console.log("✓ Stripped symbols");
    }
    
    // UPX disabled - causes macOS security to kill the executable
    // if (process.platform === "darwin") {
    //     await execAsync(`upx --best --lzma --force-macos ./build/${result.output}`);
    // } else {
    //     await execAsync(`upx --best --lzma ./build/${result.output}`);
    // }
    
    await execAsync(`chmod +x ./build/${result.output}`);
    console.log("✓ Made executable");
    
    console.log(`\n✅ Build complete: ./build/${result.output}`);
} catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
}
