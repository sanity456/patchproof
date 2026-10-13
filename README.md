# PatchProof

PatchProof is a GenLayer-native release compatibility checker. A developer records how an application uses a dependency, pins the exact release notes and migration guide, and asks independent validators to publish a cited upgrade verdict.

## Why GenLayer

Mapping prose release notes to a specific application's usage requires interpretation. The PatchProof contract fetches both public sources inside the nondeterministic consensus path. Validators independently classify the upgrade as `SAFE`, `REVIEW`, `BREAKING`, or `UNVERIFIABLE` and must agree on the verdict, severity, affected flag, source relevance, and exact source digests before the result is stored. Each non-error verdict requires exact passages from both sources, verified against the fetched text by every validator.

The browser owns wallet connection, forms, indexing, and previews. The contract owns the immutable request, source URLs, source digests, comparative validator decision, verified citations, retry path, and append-only attempt history. The browser also recovers submitted transactions after reload before allowing another write.

## Local development

```powershell
npm install
npm run dev
```

The development app runs at `http://127.0.0.1:4310`.

## Checks

```powershell
genvm-lint check contracts/patchproof.py
pytest tests/direct -q
npm run build
```

## Studionet flow

1. Connect MetaMask to GenLayer Studionet, chain `61999`.
2. Deploy PatchProof or configure a compatible contract address.
3. Create a check with the package, version range, usage declaration, release URL, and migration URL.
4. Run consensus from the owner wallet.
5. Share the public check link after finality.

All PatchProof contract calls attach `0 GEN`. Normal Studionet network fees may apply. Do not include private data; requests and results are public.
