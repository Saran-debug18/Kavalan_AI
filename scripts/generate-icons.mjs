import sharp from "sharp";
import path from "path";
import fs from "fs";

const svgPath = path.join(process.cwd(), "public", "icon.svg");
const svg = fs.readFileSync(svgPath);

const sizes = [192, 512];

async function main() {
	for (const size of sizes) {
		await sharp(svg)
			.resize(size, size)
			.png()
			.toFile(path.join(process.cwd(), "public", `icon-${size}.png`));
		console.log(`Generated icon-${size}.png`);
	}

	// Maskable variant: Android crops to a circle/rounded-square safe zone, so
	// pad the artwork inward (~20%) to keep the shield fully visible.
	const maskableSize = 512;
	const padding = Math.round(maskableSize * 0.15);
	await sharp(svg)
		.resize(maskableSize - padding * 2, maskableSize - padding * 2)
		.extend({
			top: padding,
			bottom: padding,
			left: padding,
			right: padding,
			background: "#16171a",
		})
		.png()
		.toFile(path.join(process.cwd(), "public", "icon-maskable-512.png"));
	console.log("Generated icon-maskable-512.png");

	// Favicon-sized PNG for apple-touch-icon.
	await sharp(svg)
		.resize(180, 180)
		.png()
		.toFile(path.join(process.cwd(), "public", "apple-touch-icon.png"));
	console.log("Generated apple-touch-icon.png");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
