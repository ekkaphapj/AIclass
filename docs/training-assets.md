# Training assets

Both assets are saved in the project and deployed as static files.

- Document: `public/training/document-ocr.png` — deterministic raster rendering from native HTML/Thai font using `scripts/render-training-document.mjs`. It is prominently marked fictional and has no real signature or agency emblem. The renderer contains the complete source text and can regenerate the PNG.
- Object photo: `public/training/unattended-bag.png` — generated with the built-in Imagegen tool (not the CLI). Selected output copied to the workspace unchanged. Full creation prompt:

Use case: scientific-educational. Asset: classroom photo for a Thai police cadet AI observation exercise, a fictional unattended suspicious object, not evidence of a real incident. Create a realistic documentary-style photograph, landscape 3:2, of a plain closed black nylon backpack left alone under a bench at a quiet generic public bus shelter in Thailand during daylight. Medium-wide view so the entire bag, bench, tiled ground, and part of the shelter are visible. The bag is ordinary and closed; no visible contents, no wires, no weapons, no explosives, no drugs, no people, no identifying signage, no police logos, no text. Neutral lighting, clear sharp details and natural colors. This is for practicing separating visible observations from unsupported guesses: the photo must not reveal or imply what is inside the bag.

The object is an ordinary closed bag, not a depiction of a confirmed dangerous device. Learners should distinguish observation from assumptions.

## Revised object identification asset (2026-10-19)

`public/training/unknown-device.png` replaces the bag in exercise 5. Generated with the built-in imagegen skill/tool and copied into the project; original retained. The concept reference was an unbranded wildlife trail camera, not a hazardous device. This is teacher provenance, not a claim that an image proves a model number or function. Learners compare visible optical windows, sensor-like areas, latches and strap, propose candidate device types and identify limits. Do not require a single certain label or ask learners to handle/test an actual found object.

Creation brief: photorealistic 3:2 close three-quarter view of one olive-green weatherproof wildlife trail camera on a pale concrete outdoor ledge. Rugged rectangular housing, dark circular optical lens, small dark infrared windows, lower motion-sensor-like window, side latch and short mounting strap. No branding, readable labels, people, wires, weapons, explosives or police insignia. Natural daylight with blurred greenery. A fictional unknown-object training photo, not evidence of a real incident. Image reviewed after generation. The legacy unattended-bag.png remains available for older references.
