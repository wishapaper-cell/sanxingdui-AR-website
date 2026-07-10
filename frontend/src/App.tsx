import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Stage = 'cover' | 'clean' | 'reveal' | 'ar' | 'pet';

type FragmentPart = {
  id: string;
  name: string;
  artifact: string;
  image: string;
  note: string;
  priority: number;
};

type MaterialOption = { id: string; name: string; image: string; prompt: string };
type PatternOption = { id: string; name: string; group: string; image: string };
type ColorOption = { id: string; name: string; value: string; prompt: string };
type Revelation = { title: string; symbol: string; description: string };
type GenerationState = 'idle' | 'generating-image' | 'generating-3d' | 'done' | 'error';
type GeneratedMask = {
  imageUrl: string;
  glbUrl?: string;
  prompt: string;
  version?: string;
  inputMode?: string;
  savedModel?: ExistingModelOption;
};
type ExistingModelOption = {
  id: string;
  name: string;
  url: string;
  size: string;
  source: string;
  wearProfile?: string;
  image?: string;
  createdAt?: string;
  prompt?: string;
  version?: string;
  inputMode?: string;
  materialAnalysis?: string;
  formAnalysis?: string;
  wearArea?: string;
  placementLogic?: string;
  culturalNote?: string;
  analysisSource?: string;
};

const API_BASE = '';
const STATIC_BASE = '/public';
const AR_WEAR_URL = `${window.location.origin}/ar-wear.html`;

const builtInModels: ExistingModelOption[] = [
  {
    id: 'existing-mask-01',
    name: '纵目青铜覆面',
    url: `${STATIC_BASE}/models/existing/glb/12b297fd31ca12de1f6774d43f8cc33a.glb`,
    size: '68.1 MB',
    source: 'glb.zip',
    wearProfile: 'tilted-mask',
    materialAnalysis: '青铜金属与冷灰氧化包浆，表面有不锈钢青铜的硬质反光。',
    formAnalysis: '凸眼、高鼻梁和左右耳翼完整展开，整体接近三星堆整脸祭祀面具。',
    wearArea: '整脸覆盖',
    placementLogic: '该 GLB 自身有倾斜姿态，AR 会先做局部横滚纠偏，再以鼻梁、双眼和颧骨锁定整脸。',
    culturalNote: '纵目和宽耳翼强化正面凝视感，佩戴时不再把倾斜模型当作标准正面面具硬套。',
    analysisSource: '本地 GLB 模型分析'
  },
  {
    id: 'existing-mask-02',
    name: '宽翼兽面',
    url: `${STATIC_BASE}/models/existing/glb/5b81d915043f2d52feb2c2024fbfcb6a%281%29.glb`,
    size: '63.3 MB',
    source: 'glb.zip',
    wearProfile: 'full-mask-wide',
    materialAnalysis: '深色青铜与旧化金属混合，边缘更厚，适合宽幅面具重量感。',
    formAnalysis: '横向轮廓更宽，耳翼与面颊外扩，视觉重心从鼻梁延伸到太阳穴两侧。',
    wearArea: '宽幅整脸',
    placementLogic: '扩大左右侧脸权重，用颧骨、太阳穴和眼眶稳定横向贴合，减少侧转露脸。',
    culturalNote: '宽翼结构更像仪式性兽面，佩戴时需要优先保证横向遮挡和脸宽同步。',
    analysisSource: '本地 GLB 模型分析'
  },
  {
    id: 'existing-mask-03',
    name: '玉人脸局部面饰',
    url: `${STATIC_BASE}/models/existing/glb/7575764dbcba3b3c591c775b5c6daafa.glb`,
    size: '58.3 MB',
    source: 'glb.zip',
    wearProfile: 'jade-face',
    materialAnalysis: '局部件质感偏玉青/青铜，凸起集中在眼额区域，不按整脸厚面具处理。',
    formAnalysis: '造型是玉人脸式局部面饰，重点在眉心、眼眶和上额，下面部覆盖很少。',
    wearArea: '玉人脸/眼额局部',
    placementLogic: '精准锁眉心、双眼、鼻梁上段和额头；嘴部、下巴只保留极低权重，避免把局部件拉成整脸面具。',
    culturalNote: '该模型更适合贴在玉人脸上半脸区域，左右转头时靠眼额特征点保持位置。',
    analysisSource: '本地 GLB 模型分析'
  }
];

type GeneratedModelRecord = {
  id: string;
  name?: string;
  glbUrl?: string;
  previewImageUrl?: string;
  sizeLabel?: string;
  source?: string;
  createdAt?: string;
  prompt?: string;
  version?: string;
  inputMode?: string;
  wearProfile?: string;
  materialAnalysis?: string;
  formAnalysis?: string;
  wearArea?: string;
  placementLogic?: string;
  culturalNote?: string;
  analysisSource?: string;
};

const fragmentPool: FragmentPart[] = [
  {
    id: 'set_4_top_left',
    name: '纵目',
    artifact: '大型纵目兽面',
    image: '/assets/fragments/4/4-topleft.png',
    note: '眼球呈圆筒状向前伸出，将眼肌拉出附着在眼球上，眼球中间有一带状装饰。该纵目采用嵌铸法铸造。',
    priority: 10
  },
  {
    id: 'set_4_top_right',
    name: '纵目',
    artifact: '大型纵目兽面',
    image: '/assets/fragments/4/4-topright.png',
    note: '眼球呈圆筒状向前伸出，将眼肌拉出附着在眼球上，眼球中间有一带状装饰。该纵目采用嵌铸法铸造。',
    priority: 10
  },
  {
    id: 'set_3_top_left',
    name: '耳部云雷纹碎片',
    artifact: '商青铜人',
    image: '/assets/fragments/3/3-topleft.png',
    note: '略呈长方形，耳垂处有一圆形穿孔。其上饰有云雷纹，即用连续的回旋形线条构成的几何纹样。',
    priority: 10
  },
  {
    id: 'set_3_top_right',
    name: '耳部云雷纹碎片',
    artifact: '商青铜人',
    image: '/assets/fragments/3/3-topright.png',
    note: '略呈长方形，耳垂处有一圆形穿孔。其上饰有云雷纹，即用连续的回旋形线条构成的几何纹样。',
    priority: 10
  },
  ...[1, 2, 3, 4].flatMap((set) => [
    { id: `set_${set}_lower_left`, name: `${set}-左下碎片`, artifact: artifactName(set), image: `/assets/fragments/${set}/${set}-lowleft.png`, note: `${artifactName(set)}的局部残片，可作为 AI 生成时的结构参考。`, priority: 3 },
    { id: `set_${set}_lower_right`, name: `${set}-右下碎片`, artifact: artifactName(set), image: `/assets/fragments/${set}/${set}-lowright.png`, note: `${artifactName(set)}的局部残片，可作为 AI 生成时的结构参考。`, priority: 3 }
  ]),
  { id: 'set_5_lower_left', name: '5-左下碎片', artifact: '半覆金面', image: '/assets/fragments/5/5-lowleft.png', note: '半覆金面的局部残片，可作为 AI 生成时的金面结构参考。', priority: 3 },
  { id: 'set_5_top_left', name: '5-左上碎片', artifact: '半覆金面', image: '/assets/fragments/5/5-topleft.png', note: '半覆金面的局部残片，可作为 AI 生成时的金面结构参考。', priority: 3 },
  { id: 'set_1_top_left', name: '1-左上碎片', artifact: '青铜大面具', image: '/assets/fragments/1/1-topleft.png', note: '青铜大面具的局部残片，可作为 AI 生成时的结构参考。', priority: 2 },
  { id: 'set_1_top_right', name: '1-右上碎片', artifact: '青铜大面具', image: '/assets/fragments/1/1-topright.png', note: '青铜大面具的局部残片，可作为 AI 生成时的结构参考。', priority: 2 },
  { id: 'set_2_top_left', name: '2-左上碎片', artifact: '薄金人面', image: '/assets/fragments/2/2-topleft.png', note: '薄金人面的局部残片，可作为 AI 生成时的金面结构参考。', priority: 2 },
  { id: 'set_2_top_right', name: '2-右上碎片', artifact: '薄金人面', image: '/assets/fragments/2/2-topright.png', note: '薄金人面的局部残片，可作为 AI 生成时的金面结构参考。', priority: 2 }
];

const colors: ColorOption[] = [
  { id: 'stainless-bronze', name: '不锈钢青铜', value: '#b8c3c5', prompt: '冷亮不锈钢与青铜合金混合，银灰金属主体带青铜绿氧化纹理' },
  { id: 'bronze-green', name: '青铜绿', value: '#4f8f7b', prompt: '古青铜绿锈色，局部有深褐氧化痕迹' },
  { id: 'ritual-gold', name: '祭祀金', value: '#d8af63', prompt: '温润金属金色，带轻微旧化与锤痕' },
  { id: 'jade-cyan', name: '玉青', value: '#7ac7aa', prompt: '玉质青绿色，半哑光，带细腻纹理' },
  { id: 'black-oxide', name: '黑氧化', value: '#29302d', prompt: '黑色氧化金属，边缘磨损露出青铜底色' }
];

const materials: MaterialOption[] = [
  { id: 'bronze', name: '青铜', image: '/assets/material/Bronze.png', prompt: '青铜铸造质感，厚重边缘，细微锤痕' },
  { id: 'gold', name: '金面', image: '/assets/material/gold.png', prompt: '金属覆面质感，局部抛光高光' },
  { id: 'jade', name: '玉质', image: '/assets/material/jade.png', prompt: '玉质表面，温润半透明，雕刻边缘清晰' },
  { id: 'clay', name: '陶土', image: '/assets/material/clay.png', prompt: '陶土烧制质感，细颗粒表面，古朴厚重' }
];

const patterns: PatternOption[] = [
  ...[1, 2, 3, 4].map((n) => ({ id: `cloud-${n}`, name: `云雷纹 ${n}`, group: 'Cloud', image: `/assets/pattern/Cloud/${n}.png` })),
  ...[1, 2, 3].map((n) => ({ id: `phoenix-${n}`, name: `凤鸟纹 ${n}`, group: 'Phoenix', image: `/assets/pattern/Phoenix/${n}.png` })),
  ...[1, 2, 3, 4].map((n) => ({ id: `animal-${n}`, name: `兽面纹 ${n}`, group: 'animal-face', image: `/assets/pattern/animal-face/${n}.png` })),
  ...[1, 2, 3].map((n) => ({ id: `geometry-${n}`, name: `几何纹 ${n}`, group: 'geometry', image: `/assets/pattern/geometry/${n}.png` }))
];

function App() {
  const [stage, setStage] = useState<Stage>('cover');
  const [coverGlyphReady, setCoverGlyphReady] = useState(true);
  const [sessionFragments, setSessionFragments] = useState<FragmentPart[]>(() => pickFragments());
  const [cleanProgress, setCleanProgress] = useState<Record<string, number>>({});
  const [selectedFragments, setSelectedFragments] = useState<string[]>([]);
  const [selectedColor, setSelectedColor] = useState(colors[0].id);
  const [selectedMaterial, setSelectedMaterial] = useState(materials[0].id);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([patterns[0].id]);
  const [stylePrompt, setStylePrompt] = useState('');
  const [generationState, setGenerationState] = useState<GenerationState>('idle');
  const [generationMessage, setGenerationMessage] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [generatedMask, setGeneratedMask] = useState<GeneratedMask | null>(null);
  const [lastPrompt, setLastPrompt] = useState('');
  const [modelLibrary, setModelLibrary] = useState<ExistingModelOption[]>(builtInModels);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [selectedExistingModelId, setSelectedExistingModelId] = useState(builtInModels[0].id);
  const [gestureCount, setGestureCount] = useState(0);
  const [revelation, setRevelation] = useState<Revelation>(() => buildRevelation([], materials[0], [patterns[0]], colors[0]));

  const cleaned = sessionFragments.every((fragment) => (cleanProgress[fragment.id] ?? 0) >= 100);
  const activeColor = colors.find((item) => item.id === selectedColor) ?? colors[0];
  const activeMaterial = materials.find((item) => item.id === selectedMaterial) ?? materials[0];
  const activePatterns = patterns.filter((item) => selectedPatterns.includes(item.id));
  const activeFragments = sessionFragments.filter((item) => selectedFragments.includes(item.id));
  const activeExistingModel = modelLibrary.find((item) => item.id === selectedExistingModelId) ?? modelLibrary[0] ?? builtInModels[0];
  const activeModelInsights = buildModelInsights(activeExistingModel);
  const isGenerating = generationState === 'generating-image' || generationState === 'generating-3d';
  const generationProgress = getGenerationProgress(generationState, Boolean(generatedMask?.imageUrl));

  const promptSummary = useMemo(() => ({
    fragments: activeFragments.map((item) => `${item.artifact}-${item.name}`).join('、') || '未选择碎片',
    color: activeColor.name,
    material: activeMaterial.name,
    patterns: activePatterns.map((item) => item.name).join('、') || '未选择纹样',
    style: normalizeStylePrompt(stylePrompt) || '未补充'
  }), [activeColor.name, activeFragments, activeMaterial.name, activePatterns, stylePrompt]);

  useEffect(() => {
    let cancelled = false;

    apiGetJson<{ models?: GeneratedModelRecord[] }>('/api/generated-models')
      .then((data) => {
        if (cancelled) return;
        const generatedModels = (data.models || []).map(mapGeneratedModelRecord).filter(Boolean) as ExistingModelOption[];
        const nextLibrary = mergeModelLibrary(generatedModels, builtInModels);
        setModelLibrary(nextLibrary);
        setLibraryMessage(generatedModels.length ? `已加载 ${generatedModels.length} 个后端保存的 AI 模型` : '');
        if (!nextLibrary.some((model) => model.id === selectedExistingModelId)) {
          setSelectedExistingModelId(nextLibrary[0]?.id || builtInModels[0].id);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        setLibraryMessage(`后端模型库暂时不可用: ${message}`);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const scrubFragment = (id: string) => {
    setCleanProgress((current) => ({ ...current, [id]: Math.min(100, (current[id] ?? 0) + 20) }));
  };

  const toggleFragment = (id: string) => {
    if (!cleaned) return;
    setSelectedFragments((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setGenerationState('idle');
  };

  const togglePattern = (id: string) => {
    setSelectedPatterns((current) => current.includes(id)
      ? current.length === 1 ? current : current.filter((item) => item !== id)
      : [...current, id]);
    setGenerationState('idle');
  };

  const regenerateFragments = () => {
    setSessionFragments(pickFragments());
    setCleanProgress({});
    setSelectedFragments([]);
    setGenerationState('idle');
    setGenerationError('');
    setGeneratedMask(null);
  };

  const submitToAi = async () => {
    if (!cleaned || activeFragments.length === 0 || isGenerating) return;

    setGenerationState('generating-image');
    setGenerationMessage('压缩参考图并提交多图生成...');
    setGenerationError('');
    setGeneratedMask(null);
    setLastPrompt('');

    try {
      await apiGetJson('/api/health');
      const referenceSources = [
        ...activeFragments.map((item) => item.image),
        activeMaterial.image,
        ...activePatterns.slice(0, 6).map((item) => item.image)
      ];
      const imageUrls = await Promise.all(referenceSources.map((src) => assetToDataUrl(src)));
      const prompt = buildMaskPrompt(activeFragments, activeMaterial, activePatterns, activeColor, stylePrompt);
      setLastPrompt(prompt);

      const imageData = await apiPostJson<MaskImageResponse>('/api/generate-mask-image', {
        prompt,
        imageUrls
      });
      const imageUrl = pickGeneratedImageUrl(imageData);
      if (!imageUrl) throw new Error('AI 未返回面具图片 URL');
      setGeneratedMask({ imageUrl, prompt });

      setGenerationState('generating-3d');
      setGenerationMessage('单视角图生 3D 建模中...');
      const nextMask = await generate3DFromImage(imageUrl, prompt);
      setGeneratedMask(nextMask);
      if (nextMask.savedModel) {
        setModelLibrary((current) => mergeModelLibrary([nextMask.savedModel as ExistingModelOption], current));
        setSelectedExistingModelId(nextMask.savedModel.id);
        setLibraryMessage(`新生成的 GLB「${nextMask.savedModel.name}」已保存到后端模型库`);
      }
      setRevelation(buildRevelation(activeFragments, activeMaterial, activePatterns, activeColor));
      setGenerationState('done');
      setGenerationMessage('单视角 3D 面具生成完成');
      setStage('reveal');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[AI生成] 失败:', error);
      setGenerationState('error');
      setGenerationError(message);
      setGenerationMessage('生成失败，请检查后端或额度');
    }
  };

  const retry3D = async () => {
    if (!generatedMask?.imageUrl || isGenerating) return;
    const prompt = generatedMask.prompt || lastPrompt || buildMaskPrompt(activeFragments, activeMaterial, activePatterns, activeColor, stylePrompt);

    setGenerationState('generating-3d');
    setGenerationMessage('使用已生成面具图重试单视角 3D...');
    setGenerationError('');
    try {
      const nextMask = await generate3DFromImage(generatedMask.imageUrl, prompt);
      setGeneratedMask(nextMask);
      if (nextMask.savedModel) {
        setModelLibrary((current) => mergeModelLibrary([nextMask.savedModel as ExistingModelOption], current));
        setSelectedExistingModelId(nextMask.savedModel.id);
        setLibraryMessage(`新生成的 GLB「${nextMask.savedModel.name}」已保存到后端模型库`);
      }
      setRevelation(buildRevelation(activeFragments, activeMaterial, activePatterns, activeColor));
      setGenerationState('done');
      setGenerationMessage('单视角 3D 面具生成完成');
      setStage('reveal');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[3D重试] 失败:', error);
      setGenerationState('error');
      setGenerationError(message);
      setGenerationMessage('混元 3D 资源不足，可稍后只重试建模');
    }
  };

  const enterArWear = () => {
    if (!generatedMask?.glbUrl) return;
    const url = new URL(AR_WEAR_URL);
    url.searchParams.set('model', generatedMask.glbUrl);
    applyWearParams(url, generatedMask.savedModel || {
      id: 'generated-current',
      name: '当前 AI 生成面具',
      url: generatedMask.glbUrl,
      size: 'GLB',
      source: 'AI 生成',
      wearProfile: 'full-mask'
    });
    window.location.href = url.href;
  };

  const enterExistingModel = (model: ExistingModelOption) => {
    const url = new URL(AR_WEAR_URL);
    url.searchParams.set('model', model.url);
    applyWearParams(url, model);
    window.location.href = url.href;
  };

  return (
    <main className="app-shell" data-stage={stage}>
      <div className="grain" />
      <Header stage={stage} onStageChange={setStage} />

      {stage === 'cover' && (
        <section className="cover-panel">
          <img className="cover-bg" src="/images/cover-mask.png" alt="古蜀覆面录背景" />
          <div className="cover-shade" />
          <div className="cover-center">
            <div className="cover-main-title">
              {coverGlyphReady && (
                <img className="cover-shu-image" src="/images/shu-title.png" alt="封面蜀字" onError={() => setCoverGlyphReady(false)} />
              )}
              {!coverGlyphReady && <div className="cover-shu-fallback">蜀</div>}
              <div className="cover-title-copy" aria-label="古蜀覆面:三星堆数字神面">
                <span className="cover-title-weibei">古蜀覆面:</span>
                <span className="cover-title-sub">三星堆数字神面</span>
              </div>
            </div>
            <div className="cover-actions">
              <button className="primary" onClick={() => setStage('clean')}>进入重现</button>
              <button className="secondary" onClick={() => setStage('reveal')}>查看模型库</button>
            </div>
          </div>
        </section>
      )}

      {stage === 'clean' && (
        <section className="workspace clean-board">
          <div className="section-head compact">
            <p className="eyebrow">重现</p>
            <h2>文明现世</h2>
            <p>清理残片后选择颜色、材质和纹样，系统会把这些参考图一起喂给 AI 生成单张面具图，再用单视角图生 3D 戴到脸上。</p>
          </div>

          <p className="click-hint">点击↓</p>
          <div className={cleaned ? 'fragment-free-grid info-ready' : 'fragment-free-grid'}>
            {sessionFragments.map((fragment) => {
              const progress = cleanProgress[fragment.id] ?? 0;
              const selected = selectedFragments.includes(fragment.id);
              return (
                <button
                  className={selected ? 'free-fragment selected' : 'free-fragment'}
                  key={fragment.id}
                  onClick={() => cleaned ? toggleFragment(fragment.id) : scrubFragment(fragment.id)}
                  onPointerMove={(event) => {
                    if (!cleaned && event.buttons === 1) scrubFragment(fragment.id);
                  }}
                  style={{ '--mask-image': `url(${fragment.image})` } as CSSProperties}
                >
                  <img src={fragment.image} alt={fragment.name} />
                  {!cleaned && <span className="fragment-dust" style={{ opacity: 1 - progress / 110 }} />}
                  <span className="clean-percent">{progress}%</span>
                  <article className="fragment-popover">
                    <strong>{fragment.artifact} · {fragment.name}</strong>
                    <p>{fragment.note}</p>
                  </article>
                </button>
              );
            })}
          </div>

          <div className={cleaned ? 'choice-area show' : 'choice-area'}>
            <div className="choice-head">
              <div>
                <p className="eyebrow">生成素材选择</p>
                <h3>选择残片、颜色、材质和纹样</h3>
              </div>
              <button className="secondary" onClick={regenerateFragments}>重新随机碎片</button>
            </div>

            <div className="asset-section">
              <h4>颜色</h4>
              <div className="color-grid">
                {colors.map((color) => (
                  <button
                    className={selectedColor === color.id ? 'color-card selected' : 'color-card'}
                    key={color.id}
                    onClick={() => {
                      setSelectedColor(color.id);
                      setGenerationState('idle');
                    }}
                  >
                    <span className="color-swatch" style={{ background: color.value }} />
                    <span>{color.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="asset-section">
              <h4>材质</h4>
              <div className="material-grid">
                {materials.map((material) => (
                  <button
                    className={selectedMaterial === material.id ? 'asset-card selected' : 'asset-card'}
                    key={material.id}
                    onClick={() => {
                      setSelectedMaterial(material.id);
                      setGenerationState('idle');
                    }}
                  >
                    <img src={material.image} alt={material.name} />
                    <span>{material.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="asset-section">
              <h4>风格补充</h4>
              <textarea
                className="style-prompt-box"
                maxLength={160}
                placeholder="例如: 更锋利的轮廓、冷白高光、庄严祭祀感"
                value={stylePrompt}
                onChange={(event) => {
                  setStylePrompt(event.target.value);
                  setGenerationState('idle');
                }}
              />
            </div>

            <div className="asset-section">
              <h4>纹样</h4>
              <div className="pattern-asset-grid">
                {patterns.map((pattern) => (
                  <button className={selectedPatterns.includes(pattern.id) ? 'asset-card selected' : 'asset-card'} key={pattern.id} onClick={() => togglePattern(pattern.id)}>
                    <img src={pattern.image} alt={pattern.name} />
                    <span>{pattern.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-submit-panel">
              <div>
                <strong>已选择:</strong>
                <p>碎片:{promptSummary.fragments}</p>
                <p>颜色:{promptSummary.color}</p>
                <p>材质:{promptSummary.material}</p>
                <p>纹样:{promptSummary.patterns}</p>
                <p>风格:{promptSummary.style}</p>
                {generationMessage && <p className={generationState === 'error' ? 'generation-status error' : 'generation-status'}>{generationMessage}</p>}
                {generationState !== 'idle' && (
                  <div className="generation-progress" aria-label="生成进度">
                    <div className="generation-progress-track">
                      <span style={{ width: `${generationProgress}%` }} />
                    </div>
                    <div className="generation-steps">
                      <span className={generationProgress >= 35 ? 'done' : ''}>生成图片</span>
                      <span className={generationProgress >= 72 ? 'done' : ''}>单视角建模</span>
                      <span className={generationProgress >= 100 ? 'done' : ''}>进入模型库</span>
                    </div>
                  </div>
                )}
                {generationState === 'done' && generatedMask?.savedModel && (
                  <p className="generation-complete">生成完成，{generatedMask.savedModel.name} 已纳入后端模型库。</p>
                )}
                {generationError && <p className="generation-error">{generationError}</p>}
                {generationState === 'error' && generatedMask?.imageUrl && !generatedMask.glbUrl && (
                  <div className="partial-result">
                    <img src={generatedMask.imageUrl} alt="已生成的面具图" />
                    <button className="secondary" disabled={isGenerating} onClick={retry3D}>继续完成 3D 建模</button>
                  </div>
                )}
              </div>
              <button className="primary" disabled={!cleaned || selectedFragments.length === 0 || isGenerating} onClick={submitToAi}>
                {isGenerating ? 'AI 生成中...' : '提交 AI 生成面具'}
              </button>
            </div>
          </div>
        </section>
      )}

      {stage === 'reveal' && (
        <section className="workspace identity-board reveal-library">
          <div className="identity-copy existing-copy">
            <p className="eyebrow">揭秘</p>
            <h2>{activeExistingModel.name}</h2>
            <p className="identity-symbol">{activeModelInsights.headline}</p>
            <p>{activeModelInsights.summary}</p>
            <dl className="model-analysis-list">
              {activeModelInsights.items.map((item) => (
                <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>
              ))}
            </dl>
            {libraryMessage && <p className="library-message">{libraryMessage}</p>}
            <div className="existing-model-list">
              {modelLibrary.map((model) => (
                <button
                  className={model.id === activeExistingModel.id ? 'existing-model-card selected' : 'existing-model-card'}
                  key={model.id}
                  onClick={() => setSelectedExistingModelId(model.id)}
                >
                  {model.image && <img src={model.image} alt={model.name} />}
                  <span>{model.name}</span>
                  <small>{model.size} / {model.source} / {model.wearProfile || 'auto-face'}</small>
                </button>
              ))}
            </div>
            <button className="primary wide" onClick={() => enterExistingModel(activeExistingModel)}>进入 AR 穿戴</button>
          </div>

          <div className="existing-model-stage">
            <ExistingModelPreview model={activeExistingModel} />
            <div className="existing-stage-footer">
              <div>
                <p className="eyebrow">当前展示</p>
                <h2>{activeExistingModel.name}</h2>
                <p>{activeExistingModel.size} / {activeExistingModel.source} / {activeExistingModel.wearProfile || 'auto-face'}</p>
              </div>
              <button className="secondary" onClick={() => enterExistingModel(activeExistingModel)}>打开当前 AR 佩戴页</button>
            </div>
          </div>
        </section>
      )}

      {stage === 'ar' && (
        <section className="workspace ar-board">
          <div className="video-frame ar-handoff-panel">
            {generatedMask ? (
              <>
                <img src={generatedMask.imageUrl} alt="待佩戴面具" />
                <button className="primary" onClick={enterArWear}>进入当前 AR 跟脸系统</button>
              </>
            ) : (
              <div className="empty-generated">
                <p className="eyebrow">AR 佩戴</p>
                <h2>先生成一个 3D 面具</h2>
                <button className="secondary" onClick={() => setStage('clean')}>返回素材选择</button>
              </div>
            )}
          </div>
          <div className="ar-control">
            <p className="eyebrow">AR 交互</p>
            <h2>当前使用 ar-wear 贴脸预设</h2>
            <button className="gesture" onClick={() => setGestureCount((value) => value + 1)}><strong>记录试戴</strong><span>{gestureCount}</span></button>
            <aside className="culture-card">
              <strong>建模说明</strong>
              <p>这里不走多视角 3D。流程固定为多图生成单张面具图，再调用 `/api/image-to-3d` 单视角建模，最后把 GLB URL 交给 `ar-wear.html?model=`。</p>
            </aside>
            <button className="primary wide" onClick={() => setStage('pet')}>生成个性化桌宠</button>
          </div>
        </section>
      )}

      {stage === 'pet' && (
        <section className="workspace pet-stage">
          <div className="certificate">
            <p className="eyebrow">个性化桌宠</p>
            <h2>你的古蜀身份:{revelation.title}</h2>
            <dl>
              <div><dt>面具颜色</dt><dd>{activeColor.name}</dd></div>
              <div><dt>面具材质</dt><dd>{activeMaterial.name}</dd></div>
              <div><dt>纹样组合</dt><dd>{promptSummary.patterns}</dd></div>
            </dl>
          </div>
          <div className="pet-card">
            <div className="pet-avatar"><span /></div>
            <p className="eyebrow">桌宠预览</p>
            <h2>青铜神面灵</h2>
            <p>桌宠部分保留为扩展入口，当前主链路已接入真实 AI 生成与单视角 3D 建模。</p>
            <button className="secondary" onClick={() => setStage('clean')}>重新生成面具</button>
          </div>
        </section>
      )}
    </main>
  );
}

function Header({ stage, onStageChange }: { stage: Stage; onStageChange: (stage: Stage) => void }) {
  const items: Array<[Stage, string]> = [
    ['clean', '重现'],
    ['reveal', '揭秘'],
    ['ar', 'AR']
  ];
  return (
    <header className={stage === 'cover' ? 'topbar cover-topbar' : 'topbar'}>
      <div>
        <span className="seal">三星堆数字神面</span>
        <h1>古蜀覆面录</h1>
      </div>
      <nav>
        {items.map(([id, label]) => (
          <button className={stage === id ? 'nav-active' : ''} key={id} onClick={() => onStageChange(id)}>{label}</button>
        ))}
      </nav>
    </header>
  );
}

function ExistingModelPreview({ model }: { model: ExistingModelOption }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState('模型加载中...');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setStatus('模型加载中...');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 0.12, 3.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x1f2926, 1.25));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.35);
    keyLight.position.set(2.4, 2.8, 3.2);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.48);
    rimLight.position.set(-2.8, 1.2, -2.4);
    scene.add(rimLight);
    const warmFill = new THREE.DirectionalLight(0xffffff, 0.38);
    warmFill.position.set(-1.6, -0.7, 2.2);
    scene.add(warmFill);

    let previewModel: THREE.Object3D | null = null;
    let baseModelScale = 1;
    let frame = 0;
    let disposed = false;
    let autoYaw = 0;
    const interaction = {
      dragging: false,
      pointerId: -1,
      lastX: 0,
      lastY: 0,
      yaw: 0,
      pitch: 0,
      targetZoom: 1,
      currentZoom: 1
    };

    const resetInteraction = () => {
      interaction.yaw = 0;
      interaction.pitch = 0;
      interaction.targetZoom = 1;
    };

    const updateZoom = (delta: number) => {
      interaction.targetZoom = clampNumber(interaction.targetZoom * Math.exp(delta), 0.68, 1.85);
    };

    const onPointerDown = (event: PointerEvent) => {
      interaction.dragging = true;
      interaction.pointerId = event.pointerId;
      interaction.lastX = event.clientX;
      interaction.lastY = event.clientY;
      host.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!interaction.dragging || interaction.pointerId !== event.pointerId) return;
      const dx = event.clientX - interaction.lastX;
      const dy = event.clientY - interaction.lastY;
      interaction.lastX = event.clientX;
      interaction.lastY = event.clientY;
      interaction.yaw += dx * 0.007;
      interaction.pitch = clampNumber(interaction.pitch + dy * 0.005, -0.48, 0.48);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (interaction.pointerId !== event.pointerId) return;
      interaction.dragging = false;
      interaction.pointerId = -1;
      if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      updateZoom(-event.deltaY * 0.001);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') interaction.yaw -= 0.12;
      else if (event.key === 'ArrowRight') interaction.yaw += 0.12;
      else if (event.key === 'ArrowUp') interaction.pitch = clampNumber(interaction.pitch - 0.1, -0.48, 0.48);
      else if (event.key === 'ArrowDown') interaction.pitch = clampNumber(interaction.pitch + 0.1, -0.48, 0.48);
      else if (event.key === '+' || event.key === '=') updateZoom(0.12);
      else if (event.key === '-' || event.key === '_') updateZoom(-0.12);
      else if (event.key === '0') resetInteraction();
      else return;
      event.preventDefault();
    };

    host.addEventListener('pointerdown', onPointerDown);
    host.addEventListener('pointermove', onPointerMove);
    host.addEventListener('pointerup', onPointerUp);
    host.addEventListener('pointercancel', onPointerUp);
    host.addEventListener('wheel', onWheel, { passive: false });
    host.addEventListener('dblclick', resetInteraction);
    host.addEventListener('keydown', onKeyDown);

    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    new GLTFLoader().load(
      model.url,
      (gltf) => {
        if (disposed) return;
        previewModel = gltf.scene;
        baseModelScale = fitPreviewModel(previewModel, getPreviewFitSize(model));
        scene.add(previewModel);
        setStatus('');
      },
      (xhr) => {
        if (!xhr.total) return;
        setStatus(`模型加载 ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
      },
      (error) => {
        console.error('[existing-model-preview] failed:', error);
        setStatus('模型预览加载失败');
      }
    );

    const render = () => {
      frame = window.requestAnimationFrame(render);
      interaction.currentZoom += (interaction.targetZoom - interaction.currentZoom) * 0.16;
      if (!interaction.dragging) autoYaw += 0.0024;
      if (previewModel) {
        previewModel.rotation.x = interaction.pitch;
        previewModel.rotation.y = Math.PI + interaction.yaw + autoYaw;
        previewModel.scale.setScalar(baseModelScale * interaction.currentZoom);
      }
      renderer.render(scene, camera);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('pointerdown', onPointerDown);
      host.removeEventListener('pointermove', onPointerMove);
      host.removeEventListener('pointerup', onPointerUp);
      host.removeEventListener('pointercancel', onPointerUp);
      host.removeEventListener('wheel', onWheel);
      host.removeEventListener('dblclick', resetInteraction);
      host.removeEventListener('keydown', onKeyDown);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
  }, [model.id, model.source, model.url, model.wearProfile]);

  return (
    <div className="existing-preview">
      <div
        className="existing-preview-canvas"
        ref={hostRef}
        role="application"
        tabIndex={0}
        aria-label="3D模型预览，拖动旋转，滚轮缩放，双击重置"
      />
      {status && <span className="existing-preview-status">{status}</span>}
    </div>
  );
}

function fitPreviewModel(model: THREE.Object3D, fitSize: number) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  const baseScale = maxDim > 0.001 ? fitSize / maxDim : 1;
  model.position.copy(center).multiplyScalar(-baseScale);
  model.scale.setScalar(baseScale);
  model.rotation.y = Math.PI;
  return baseScale;
}

async function apiGetJson<T>(path: string): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`后端请求失败 ${path}: ${message}`);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data as { error?: string }).error || `API 请求失败:${resp.status}`);
  return data as T;
}

async function apiPostJson<T>(path: string, body: unknown): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`后端请求失败 ${path}: ${message}`);
  }
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error((data as { error?: string }).error || `API 请求失败:${resp.status}`);
  return data as T;
}

async function generate3DFromImage(imageUrl: string, prompt: string): Promise<GeneratedMask> {
  const modelData = await apiPostJson<Model3DResponse>('/api/image-to-3d', { imageUrl, prompt });
  if (!modelData.glbUrl) throw new Error('图生 3D 未返回 GLB 模型');
  const savedModel = modelData.savedModel ? mapGeneratedModelRecord(modelData.savedModel) : null;
  return {
    imageUrl,
    glbUrl: modelData.glbUrl,
    prompt,
    version: modelData.version,
    inputMode: modelData.inputMode,
    savedModel: savedModel || undefined
  };
}

async function assetToDataUrl(src: string): Promise<string> {
  const img = await loadImage(src);
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建图片压缩画布');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`素材图片加载失败:${src}`));
    img.src = src;
  });
}

function pickGeneratedImageUrl(data: MaskImageResponse) {
  return data.imageUrl || data.url || '';
}

function mapGeneratedModelRecord(model: GeneratedModelRecord): ExistingModelOption | null {
  if (!model?.id || !model.glbUrl) return null;
  const fallbackAnalysis = deriveModelAnalysisFromPrompt(model.prompt || '', model.name || '');
  return {
    id: model.id,
    name: model.name || fallbackAnalysis.name,
    url: model.glbUrl,
    image: model.previewImageUrl || undefined,
    size: model.sizeLabel || 'GLB',
    source: model.source || 'AI 生成',
    wearProfile: model.wearProfile || fallbackAnalysis.wearProfile,
    createdAt: model.createdAt,
    prompt: model.prompt,
    version: model.version,
    inputMode: model.inputMode,
    materialAnalysis: model.materialAnalysis || fallbackAnalysis.materialAnalysis,
    formAnalysis: model.formAnalysis || fallbackAnalysis.formAnalysis,
    wearArea: model.wearArea || fallbackAnalysis.wearArea,
    placementLogic: model.placementLogic || fallbackAnalysis.placementLogic,
    culturalNote: model.culturalNote || fallbackAnalysis.culturalNote,
    analysisSource: model.analysisSource || fallbackAnalysis.analysisSource
  };
}

function mergeModelLibrary(primary: ExistingModelOption[], fallback: ExistingModelOption[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback].filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

function isAiGeneratedModel(model?: ExistingModelOption) {
  if (!model) return false;
  return model.id.startsWith('mask-') || model.id === 'generated-current' || model.source.includes('AI');
}

function applyWearParams(url: URL, model: ExistingModelOption) {
  if (model.wearProfile) url.searchParams.set('profile', model.wearProfile);
  if (isAiGeneratedModel(model)) url.searchParams.set('fit', getGeneratedWearFit(model));
}

function getGeneratedWearFit(model: ExistingModelOption) {
  if (model.wearProfile === 'jade-face') return '0.82';
  if (model.wearProfile === 'full-mask-wide') return '1.14';
  if (model.wearProfile === 'tilted-mask') return '1.04';
  return '1.05';
}

function getPreviewFitSize(model: ExistingModelOption) {
  if (isAiGeneratedModel(model)) {
    if (model.wearProfile === 'full-mask-wide') return 1.08;
    if (model.wearProfile === 'jade-face') return 1.02;
    return 1.14;
  }
  if (model.wearProfile === 'full-mask-wide') return 1.1;
  if (model.wearProfile === 'jade-face') return 1.08;
  if (model.wearProfile === 'tilted-mask') return 1.16;
  return 1.22;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildModelInsights(model: ExistingModelOption) {
  const analysis = deriveModelAnalysisFromPrompt(model.prompt || '', model.name);
  const materialAnalysis = model.materialAnalysis || analysis.materialAnalysis;
  const formAnalysis = model.formAnalysis || analysis.formAnalysis;
  const wearArea = model.wearArea || analysis.wearArea;
  const placementLogic = model.placementLogic || analysis.placementLogic;
  const culturalNote = model.culturalNote || analysis.culturalNote;
  const headline = model.wearArea || analysis.wearArea;
  return {
    headline,
    summary: culturalNote,
    items: [
      { label: 'AI 命名', value: model.name || analysis.name },
      { label: '材质判断', value: materialAnalysis },
      { label: '形制特征', value: formAnalysis },
      { label: '佩戴区域', value: wearArea },
      { label: '定位逻辑', value: placementLogic },
      { label: '模型来源', value: `${model.source}${model.size ? ` / ${model.size}` : ''}${model.analysisSource ? ` / ${model.analysisSource}` : ''}` },
      { label: '建模方式', value: model.inputMode ? `${model.inputMode} 单视角图生 3D` : '单视角 GLB 试戴模型' }
    ].filter((item) => item.value)
  };
}

function deriveModelAnalysisFromPrompt(prompt: string, fallbackName = '') {
  const text = `${fallbackName} ${prompt}`;
  const hasSteelBronze = text.includes('不锈钢青铜') || text.includes('不锈钢');
  const hasGold = text.includes('金');
  const hasJade = text.includes('玉');
  const hasClay = text.includes('陶');
  const hasWide = text.includes('宽耳翼') || text.includes('宽幅');
  const hasEye = text.includes('纵目') || text.includes('凸起眼睛');
  const hasPartialFace = hasJade || text.toLowerCase().includes('jade') || text.includes('局部') || text.includes('面饰') || text.includes('玉人脸');
  const material = hasSteelBronze
    ? '不锈钢青铜混合质感，冷亮金属底色叠加青铜氧化纹理。'
    : hasGold
      ? '金属金面质感，强调薄金覆面和旧化高光。'
      : hasJade
        ? '玉质青绿色半哑光质感，适合更轻的装饰性面饰。'
        : hasClay
          ? '陶土与矿物旧化质感，表面反光弱，形体更朴拙。'
          : '青铜旧化金属质感，表面以氧化包浆和浮雕纹理为主。';
  const form = hasEye
    ? '正面纵目、高鼻梁、眼眶凸起，保留三星堆面具的五官中心结构。'
    : hasWide
      ? '左右轮廓外扩，耳翼和面颊更宽，适合宽幅整脸佩戴。'
      : '以鼻梁、眼眶和面颊为主体的对称面具结构。';
  const wearProfile = hasPartialFace ? 'jade-face' : hasWide ? 'full-mask-wide' : 'full-mask';
  return {
    name: hasSteelBronze ? '不锈钢青铜纵目面具' : hasGold ? '金面祭仪面具' : hasJade ? '玉青神面' : 'AI 生成三星堆面具',
    wearProfile,
    materialAnalysis: material,
    formAnalysis: form,
    wearArea: hasWide ? '宽幅整脸' : '整脸覆盖',
    placementLogic: hasWide
      ? '以鼻梁为中心，同时提高颧骨、太阳穴和侧脸边缘权重，保证左右转头时仍贴合。'
      : '以鼻梁为中心锚点，双眼、颧骨和下巴共同绑定，按整脸面具方式佩戴。',
    culturalNote: '根据生成提示和模型来源识别为三星堆风格试戴面具，已按单视角图生 3D 模型纳入模型库。',
    analysisSource: '生成提示分析'
  };
}

function getGenerationProgress(state: GenerationState) {
  if (state === 'generating-image') return 35;
  if (state === 'generating-3d') return 72;
  if (state === 'done') return 100;
  if (state === 'error') return 100;
  return 0;
}

function normalizeStylePrompt(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function buildMaskPrompt(fragments: FragmentPart[], material: MaterialOption, activePatterns: PatternOption[], color: ColorOption, stylePrompt = '') {
  const fragmentText = fragments.map((item) => `${item.artifact}${item.name}`).join('、') || '三星堆纵目面具结构';
  const patternText = activePatterns.map((item) => item.name).join('、') || '古蜀几何纹样';
  const styleText = normalizeStylePrompt(stylePrompt);
  const styleLine = styleText ? `用户补充风格:${styleText}。` : '';
  return `设计一个${color.name}${material.name}三星堆面具。参考碎片:${fragmentText}。参考纹样:${patternText}。颜色:${color.prompt}。材质:${material.prompt}。${styleLine}造型要求:古蜀文明祭祀面具，正面纵目，夸张凸起眼睛，高鼻梁，宽耳翼，庄严神秘；单一面具，居中对称，纯白背景，无人物，无佩戴者，无文字，清晰轮廓，适合单视角图生3D建模。`;
}

function buildRevelation(fragments: FragmentPart[], material: MaterialOption, activePatterns: PatternOption[], color: ColorOption): Revelation {
  const hasEye = fragments.some((item) => item.name.includes('纵目'));
  const hasThunder = activePatterns.some((item) => item.name.includes('云雷'));
  const hasPhoenix = activePatterns.some((item) => item.name.includes('凤鸟'));
  const hasAnimal = activePatterns.some((item) => item.name.includes('兽面'));
  const role = hasEye ? '纵目司望' : hasPhoenix ? '凤羽通天' : hasAnimal ? '兽面守门' : hasThunder ? '云雷护祭' : '神面执仪';
  const title = `${color.name}${material.name}${role}`;
  const symbol = hasEye
    ? '象征远视、洞察与跨越时间的凝望。'
    : hasPhoenix
      ? '象征升腾、复归与天地之间的往返。'
      : hasAnimal
        ? '象征守护、威仪与边界的开启。'
        : hasThunder
          ? '象征秩序、回旋与祭祀力量的聚合。'
          : '象征古蜀神面从残片中重新显影。';
  return {
    title,
    symbol,
    description: `系统根据你选择的${color.name}颜色、${material.name}材质、${activePatterns.map((item) => item.name).join('、') || '纹样'}与${fragments.map((item) => item.name).join('、') || '残片'}生成单张面具图，并用单视角图生 3D 转成可佩戴模型。`
  };
}

function pickFragments() {
  const withNotes = fragmentPool.filter((item) => item.priority >= 10).sort(() => Math.random() - 0.5);
  const rest = fragmentPool.filter((item) => item.priority < 10).sort(() => Math.random() - 0.5);
  return [...withNotes.slice(0, 2), ...rest].sort(() => Math.random() - 0.5).slice(0, 4);
}

function artifactName(set: number) {
  return ['青铜大面具', '薄金人面', '商青铜人', '大型纵目兽面'][set - 1] ?? '三星堆面具';
}

type MaskImageResponse = {
  imageUrl?: string;
  url?: string;
  prompt?: string;
  inputCount?: number;
};

type Model3DResponse = {
  glbUrl?: string;
  previewUrl?: string;
  previewImageUrl?: string;
  version?: string;
  inputMode?: string;
  savedModel?: GeneratedModelRecord;
};

export default App;
