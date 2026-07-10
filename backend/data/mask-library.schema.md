# Mask Library Database Framework

This file explains `mask-library.json`.

## Main Objects

- `prototypeMasks`: three real mask prototypes used as the source image groups.
- `prototypeMasks[].fragments`: cut parts from each real mask. These are user-selectable generation elements.
- `motifLibrary`: selectable motif options. The frontend can allow single-select or multi-select.
- `generationRequestSchema`: example payload for assembling an AI generation request.

## Current Prototype IDs

- `adult_mask`: 大人面具
- `large_protruding_eye_beast_mask`: 大型纵目兽面具
- `ritual_gold_mask`: 祭祀金面具

## Where You Fill Academic Notes

For each full mask:

- `academicProfile.periodTodo`
- `academicProfile.artifactDescriptionTodo`
- `academicProfile.visualFeatureTodo`
- `academicProfile.ritualInterpretationTodo`
- `academicProfile.referencesTodo`

For each fragment:

- `academicNoteTodo`
- `sourceCitationTodo`

For each motif:

- `academicNoteTodo`

## Suggested Asset Layout

```text
assets/
  real-masks/
    adult_mask/full.png
    large_protruding_eye_beast_mask/full.png
    ritual_gold_mask/full.png
  real-mask-fragments/
    adult_mask/adult_mask_brow.png
    large_protruding_eye_beast_mask/beast_mask_protruding_eye.png
    ritual_gold_mask/gold_mask_eye.png
  motifs/
    cloud_thunder.png
    sun_motif.png
    sacred_tree.png
```

The paths in JSON are public URL paths. Backend or frontend static hosting can map them to real files later.
