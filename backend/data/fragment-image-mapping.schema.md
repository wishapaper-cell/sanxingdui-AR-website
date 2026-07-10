# Fragment Image Mapping Database

`fragment-image-mapping.json` is generated from the actual repository folder `fragments/`.

It is different from the earlier conceptual database:

- It does not invent future paths.
- It maps the image files that already exist in the repo.
- It preserves missing pieces, for example `fragments/5` only has `topleft` and `lowleft` besides `full`.

## Real Source Folder Shape

```text
fragments/
  1/
    1-full.png
    1-topleft.png
    1-topright.png
    1-lowleft.png
    1-lowright.png
  2/
  3/
  4/
  5/
```

## Key Fields

### `prototypeMasks`

The three real mask identities you described:

- `adult_mask`: 大人面具
- `large_protruding_eye_beast_mask`: 大型纵目兽面具
- `ritual_gold_mask`: 祭祀金面具

Fill `sourceFragmentSetIds` after deciding which `fragments/{number}` folder belongs to which real mask.

Example:

```json
"sourceFragmentSetIds": ["fragment_set_1"]
```

### `fragmentSets`

Each item maps one real folder under `fragments/`.

Important fields to fill:

- `bindToPrototypeMaskIdTodo`
- `bindConfidenceTodo`
- `curatorNoteTodo`
- `completeImage.academicNoteTodo`
- `selectableFragments[].academicNoteTodo`
- `selectableFragments[].sourceCitationTodo`

### `selectableFragments`

These are the pieces users can choose in the program.

Slot mapping:

- `top_left`: 左上碎片
- `top_right`: 右上碎片
- `lower_left`: 左下碎片
- `lower_right`: 右下碎片

### `motifSelection`

This links to the motif library in `mask-library.json`. Motifs can be single-select or multi-select.

## API

```http
GET /api/fragment-image-mapping
GET /api/fragment-image-mapping/prototypes
GET /api/fragment-image-mapping/sets/:id
```

Examples:

```http
GET /api/fragment-image-mapping/sets/fragment_set_1
GET /api/fragment-image-mapping/sets/1
```

## Recommended Filling Order

1. Open each `fragments/{number}/{number}-full.png` and identify which real mask prototype it corresponds to.
2. Fill `fragmentSets[].bindToPrototypeMaskIdTodo`.
3. Add the set id to the matching `prototypeMasks[].sourceFragmentSetIds`.
4. Fill academic notes for the full image.
5. Fill academic notes for each fragment.
6. Fill motif explanations in `mask-library.json`.
## Confirmed Artifact Mapping

The user confirmed the current `fragments/` mapping as:

| Fragment Set | Source Folder | Artifact Name |
|---|---|---|
| `fragment_set_1` | `fragments/1` | 青铜大面具 |
| `fragment_set_2` | `fragments/2` | 薄金人面 |
| `fragment_set_3` | `fragments/3` | 商青铜人 |
| `fragment_set_4` | `fragments/4` | 大型纵目兽面 |
| `fragment_set_5` | `fragments/5` | 半覆金面 |

These names are now written into:

- `prototypeMasks[]`
- `fragmentSets[].prototypeMaskId`
- `fragmentSets[].artifactNameCn`
- `fragmentSets[].completeImage.artifactNameCn`
- `fragmentSets[].selectableFragments[].artifactNameCn`
- `artifactSetIndex`