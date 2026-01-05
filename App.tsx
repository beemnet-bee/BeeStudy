
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import katex from 'katex';
import pptxgen from 'pptxgenjs';
import { ViewType, StudyMaterial, ChatMessage, StagedFile, StudyConfig, StudyGoal, Difficulty, StudyFormula, Slide, SlideDeck } from './types';
import { analyzeMaterial, chatWithTutor, generateSlideOutline, generateSingleSlide } from './services/geminiService';
import FlashcardSet from './components/FlashcardSet';
import Quiz from './components/Quiz';

const BeeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bee-body-grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <circle cx="50" cy="50" r="48" fill="currentColor" fillOpacity="0.03" />
    <path d="M40 50C40 44.4772 44.4772 40 50 40C55.5228 40 60 44.4772 60 50V65C60 70.5228 55.5228 75 50 75C44.4772 75 40 70.5228 40 65V50Z" fill="url(#bee-body-grad)" />
    <path d="M40 52H60V56H40V52Z" fill="#1f2937" fillOpacity="0.1" />
    <path d="M40 62H60V66H40V62Z" fill="#1f2937" fillOpacity="0.1" />
    <circle cx="50" cy="34" r="12" fill="#1f2937" />
    <circle cx="46" cy="32" r="2" fill="white" />
    <circle cx="54" cy="32" r="2" fill="white" />
    <path d="M40 45C25 45 15 30 22 22C29 14 40 25 40 45Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
    <path d="M60 45C75 45 85 30 78 22C71 14 60 25 60 45Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeOpacity="0.1" strokeWidth="0.5" />
    <path d="M45 24C43 15 38 15 38 15" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    <path d="M55 24C57 15 62 15 62 15" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" />
    <path d="M42 30L50 26L58 30L50 34L42 30Z" fill="#fbbf24" filter="url(#glow)" />
  </svg>
);

const SplashScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [fading, setFading] = useState(false);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setFading(true);
      setTimeout(onComplete, 800);
    }, 2500);
    return () => clearTimeout(timeout);
  }, [onComplete]);

  return (
    <div className={`fixed inset-0 z-[1000] flex flex-col items-center justify-center bg-white transition-all duration-700 ${fading ? 'animate-splash-out opacity-0' : ''}`}>
      <div className="relative animate-splash-in">
        <BeeIcon className="w-20 h-20 md:w-28 md:h-28" />
        <div className="absolute inset-0 bg-yellow-400/20 blur-[60px] rounded-full -z-10 animate-pulse"></div>
      </div>
      <div className="mt-6 md:mt-8 text-center space-y-4 animate-splash-in [animation-delay:0.3s]">
        <h1 className="text-2xl md:text-4xl font-black text-gray-900 tracking-tighter uppercase">Bee Study</h1>
        <div className="flex items-center gap-2 justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce [animation-delay:0.2s]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce [animation-delay:0.4s]"></div>
          <span className="text-[9px] font-black uppercase tracking-[0.4em] text-gray-400 ml-1">Loading Hive</span>
        </div>
      </div>
    </div>
  );
};

const MathRenderer: React.FC<{ text: string, className?: string }> = ({ text, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    let processedText = text;
    processedText = processedText.replace(/\$\$(.*?)\$\$/gs, (match, formula) => {
      try { return katex.renderToString(formula, { displayMode: true, throwOnError: false }); } catch (e) { return match; }
    });
    processedText = processedText.replace(/\$(.*?)\$/g, (match, formula) => {
      try { return katex.renderToString(formula, { displayMode: false, throwOnError: false }); } catch (e) { return match; }
    });
    containerRef.current.innerHTML = processedText;
  }, [text]);
  return <div ref={containerRef} className={`leading-relaxed ${className}`} />;
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [view, setView] = useState<ViewType>(ViewType.HOME);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [material, setMaterial] = useState<StudyMaterial | null>(null);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [currentLessonIdx, setCurrentLessonIdx] = useState(0);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isFormulaSidebarOpen, setIsFormulaSidebarOpen] = useState(false);
  const [showAddSlideModal, setShowAddSlideModal] = useState(false);
  const [newSlideTopic, setNewSlideTopic] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [slideDecks, setSlideDecks] = useState<SlideDeck[]>([]);
  
  const [selectedSlideTopics, setSelectedSlideTopics] = useState<string[]>([]);
  const [customSlideTopic, setCustomSlideTopic] = useState('');
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [slideGenerationProgress, setSlideGenerationProgress] = useState(0);
  const [slideGenerationStatus, setSlideGenerationStatus] = useState('');

  const slideContainerRef = useRef<HTMLDivElement>(null);
  const [timer, setTimer] = useState(1500); 
  const [timerActive, setTimerActive] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [isReading, setIsReading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0); 
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioOffset, setAudioOffset] = useState(0); 
  const [lastStartedAt, setLastStartedAt] = useState(0); 
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [config, setConfig] = useState<StudyConfig>({
    goal: 'Concept Mastery',
    difficulty: 'University',
    includeQuiz: true,
    includeCards: true
  });

  useEffect(() => {
    let interval: any;
    if (timerActive && timer > 0) {
      interval = setInterval(() => setTimer(t => t - 1), 1000);
    } else if (timer === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timer]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) slideContainerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const resetTimer = () => { setTimer(1500); setTimerActive(false); };
  const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });

  const stopReading = () => {
    if (sourceRef.current) { sourceRef.current.stop(); sourceRef.current = null; }
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    setIsReading(false); setIsPaused(false); setAudioBuffer(null); setAudioOffset(0); setReadingProgress(0);
  };

  const playLessonAudio = async () => {
    if (!material) return;
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    if (isPaused && audioBuffer) {
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      sourceRef.current = source;
      setLastStartedAt(ctx.currentTime);
      source.start(0, audioOffset);
      setIsPaused(false); setIsReading(true);
      return;
    }
    stopReading();
    setIsReading(true);
    try {
      const lesson = material.curriculum[currentLessonIdx];
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Act as Buzz, a helpful tutor. Read this lesson clearly: ${lesson.content}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const bytes = Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0));
        const dataInt16 = new Int16Array(bytes.buffer);
        const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
        const channelData = buffer.getChannelData(0);
        for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
        setAudioBuffer(buffer);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        sourceRef.current = source;
        setAudioOffset(0); setLastStartedAt(ctx.currentTime);
        source.start();
        source.onended = () => { if (sourceRef.current === source && !isPaused) { setIsReading(false); setAudioBuffer(null); } };
      }
    } catch (e) {
      console.error(e); setIsReading(false);
    }
  };

  const pauseReading = () => {
    if (sourceRef.current && audioContextRef.current && isReading) {
      const ctx = audioContextRef.current;
      sourceRef.current.stop();
      const elapsedSinceLastStart = ctx.currentTime - lastStartedAt;
      setAudioOffset(prev => prev + elapsedSinceLastStart);
      setIsPaused(true); setIsReading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setError(null);
    const fileArray = Array.from(files) as File[];
    const studyFile = fileArray.find(f => f.name.endsWith('.beestudy'));
    if (studyFile) {
      try {
        const text = await studyFile.text();
        const savedData = JSON.parse(text);
        setMaterial(savedData.material);
        setChatHistory(savedData.chatHistory || []);
        setConfig(savedData.config || config);
        setCurrentLessonIdx(savedData.currentLessonIdx || 0);
        setSlideDecks(savedData.slideDecks || []);
        setView(ViewType.LEARN);
        return;
      } catch (err) { setError("Failed to parse the Hive session."); return; }
    }
    const newStaged: StagedFile[] = fileArray.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined
    }));
    setStagedFiles(prev => [...prev, ...newStaged]);
  };

  const removeFile = (id: string) => setStagedFiles(prev => prev.filter(f => f.id !== id));

  const saveStudy = () => {
    if (!material) return;
    const studyData = { material, config, chatHistory, currentLessonIdx, slideDecks };
    const blob = new Blob([JSON.stringify(studyData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${material.title.replace(/\s+/g, '_')}.beestudy`;
    link.click();
  };

  const downloadPptx = async (deck: SlideDeck) => {
    const pres = new pptxgen();
    pres.title = deck.title;
    deck.slides.forEach(slide => {
      const s = pres.addSlide();
      s.background = { color: 'FFFFFF' };
      s.addText(slide.title, { x: 0.5, y: 0.5, w: '90%', h: 1, fontSize: 32, bold: true, color: '1F2937', align: 'center' });
      const bullets = slide.bullets.map(b => ({ text: b.replace(/\$/g, ''), options: { bullet: true, fontSize: 18, color: '4B5563' } }));
      s.addText(bullets, { x: 0.5, y: 1.8, w: '90%', h: 4 });
      if (slide.visualPrompt) {
        s.addText(`Visual Concept: ${slide.visualPrompt}`, { x: 0.5, y: 6.5, w: '90%', fontSize: 10, italic: true, color: '9CA3AF' });
      }
    });
    pres.writeFile({ fileName: `${deck.title.replace(/\s+/g, '_')}.pptx` });
  };

  const confirmReset = () => {
    stopReading();
    setMaterial(null); setStagedFiles([]); setChatHistory([]); setCurrentLessonIdx(0); setView(ViewType.HOME); setShowResetConfirm(false);
    setSlides([]); setSlideDecks([]); setIsGeneratingSlides(false);
  };

  const startAnalysis = async () => {
    if (stagedFiles.length === 0) return;
    setLoading(true); setError(null);
    try {
      let combinedText = "";
      const media: { data: string, mimeType: string, name: string }[] = [];
      for (const staged of stagedFiles) {
        if (staged.file.type === 'application/pdf' || staged.file.type.startsWith('image/')) {
          const reader = new FileReader();
          const base64Data = await new Promise<string>((resolve) => {
             reader.onload = () => resolve(reader.result as string);
             reader.readAsDataURL(staged.file);
          });
          media.push({ data: base64Data.split(',')[1], mimeType: staged.file.type, name: staged.file.name });
        } else combinedText += await staged.file.text() + "\n";
      }
      const result = await analyzeMaterial(combinedText, media, config, material || undefined);
      setMaterial(result); if (view === ViewType.HOME) setView(ViewType.NOTES);
      setShowAddModal(false); setStagedFiles([]);
    } catch (err: any) { setError("The Hive is processing heavy load."); } finally { setLoading(false); }
  };

  const handleSendMessage = async () => {
    if (!userInput.trim() || !material) return;
    const userMsg = userInput; setUserInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);
    try {
      const lesson = material.curriculum[currentLessonIdx];
      const context = `Context: ${lesson.title}\nContent: ${lesson.content}\nGoal: ${config.goal}`;
      const response = await chatWithTutor(chatHistory, context, userMsg);
      setChatHistory(prev => [...prev, { role: 'model', text: response }]);
    } catch { setChatHistory(prev => [...prev, { role: 'model', text: "Bzzz... signal lost." }]); } finally {
      setIsTyping(false); setTimeout(scrollToBottom, 50);
    }
  };

  const handleGenerateSlides = async () => {
    const finalTopics = [...selectedSlideTopics];
    if (customSlideTopic.trim()) finalTopics.push(customSlideTopic.trim());
    if (finalTopics.length === 0) return;
    setIsGeneratingSlides(true); setSlides([]); setCurrentSlideIdx(0); setSlideGenerationProgress(0); setSlideGenerationStatus('Architecting presentation flow...');
    try {
      const context = material ? material.summary : "";
      const outline = await generateSlideOutline(finalTopics, context);
      if (outline.length === 0) throw new Error("Outline failed.");
      const generatedSlides: Slide[] = [];
      for (let i = 0; i < outline.length; i++) {
        const title = outline[i];
        setSlideGenerationStatus(`Baking Slide ${i+1}/${outline.length}`);
        const slideContent = await generateSingleSlide(title, outline, context);
        generatedSlides.push(slideContent);
        setSlides([...generatedSlides]);
        setSlideGenerationProgress(Math.round(((i + 1) / outline.length) * 100));
      }
      const newDeck: SlideDeck = {
        id: Math.random().toString(36).substr(2, 9),
        title: `Deck: ${finalTopics[0].substring(0, 20)}...`,
        timestamp: Date.now(),
        slides: generatedSlides
      };
      setSlideDecks(prev => [newDeck, ...prev]); setSlideGenerationStatus('Deck construction complete!');
    } catch (err) { setError("Failed to construct slide hive."); } finally { setIsGeneratingSlides(false); }
  };

  const handleAddIndividualSlide = async () => {
    if (!newSlideTopic.trim() || !material) return;
    const topic = newSlideTopic; setNewSlideTopic(''); setShowAddSlideModal(false);
    setIsGeneratingSlides(true); setSlideGenerationStatus(`Baking new slide...`);
    try {
      const context = material.summary;
      const newSlide = await generateSingleSlide(topic, slides.map(s => s.title), context, "Focus on this sub-topic addition.");
      const updatedSlides = [...slides, newSlide];
      setSlides(updatedSlides); setCurrentSlideIdx(updatedSlides.length - 1);
      setSlideDecks(prev => prev.map(d => d.slides === slides ? { ...d, slides: updatedSlides } : d));
    } catch (err) { setError("Failed to generate extra slide."); } finally { setIsGeneratingSlides(false); }
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] h-full w-full animate-fade-in px-6">
          <div className="relative mb-12">
            <BeeIcon className="w-20 h-20 md:w-28 md:h-28 text-yellow-400 animate-bounce" />
            <div className="absolute inset-0 bg-yellow-400/20 blur-[60px] rounded-full -z-10 animate-pulse"></div>
          </div>
          <h2 className="text-xl md:text-3xl font-black text-gray-900 mt-6 uppercase tracking-tighter">Synthesizing...</h2>
          <div className="mt-4 flex flex-col items-center gap-2">
            <div className="w-64 h-1 bg-gray-100 rounded-full overflow-hidden">
               <div className="h-full bg-yellow-400 animate-pulse w-1/3"></div>
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Constructing your Hive Intelligence</p>
          </div>
        </div>
      );
    }

    if (view === ViewType.HOME) {
      return (
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-8 md:py-12 animate-fade-in">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <div className="flex-1 text-left space-y-4 md:space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-lg border border-yellow-100/50">
                <span className="text-[8px] font-black uppercase tracking-[0.2em]">Next-Gen Learning</span>
              </div>
              <h1 className="text-3xl md:text-5xl lg:text-7xl font-black text-gray-900 leading-tight tracking-tighter">
                Smart Study, <br /><span className="text-yellow-400 italic">Sweetened.</span>
              </h1>
              <p className="text-lg md:text-xl text-gray-500 font-medium leading-relaxed max-w-xl">
                The AI-powered hive that turns your documents into interactive mastery.
              </p>
              <button onClick={() => document.getElementById('file-input')?.click()} className="px-6 py-3 bg-gray-900 text-white font-black rounded-xl hover:bg-black transition-all shadow-lg flex items-center gap-2 text-xs uppercase"><i className="fa-solid fa-cloud-arrow-up"></i> Upload Files</button>
              <input id="file-input" type="file" multiple className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.txt,.beestudy" />
            </div>
            <div className="flex-1 w-full max-w-md relative bg-white rounded-[32px] p-8 shadow-2xl border border-gray-50">
                <h3 className="text-sm md:text-base font-black text-gray-900 uppercase mb-6 flex items-center gap-2"><i className="fa-solid fa-box-archive text-yellow-500"></i> Staging Hive</h3>
                <div className="space-y-2 max-h-[220px] overflow-y-auto mb-6 pr-2">
                  {stagedFiles.length === 0 ? (
                    <div className="py-10 border border-dashed border-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-200">
                      <BeeIcon className="w-8 h-8 mb-2 opacity-10" />
                      <p className="text-[8px] font-black uppercase tracking-widest">Ready for Input</p>
                    </div>
                  ) : stagedFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-3 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                       <i className={f.file.type.includes('pdf') ? 'fa-solid fa-file-pdf text-red-500' : 'fa-solid fa-file-image text-blue-500'}></i>
                       <p className="flex-1 text-[10px] font-black truncate">{f.file.name}</p>
                       <button onClick={() => removeFile(f.id)} className="w-6 h-6 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                    </div>
                  ))}
                </div>
                <button disabled={stagedFiles.length === 0} onClick={startAnalysis} className="w-full py-3 bg-yellow-400 text-white rounded-xl font-black text-xs shadow-lg uppercase tracking-widest">Construct Study Hive</button>
            </div>
          </div>
        </div>
      );
    }

    if (!material) return null;

    if (view === ViewType.SLIDES) {
      if (slides.length === 0 && !isGeneratingSlides) {
        return (
          <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in flex flex-col items-center">
             <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-8">
               <div className="bg-white rounded-[32px] p-8 shadow-2xl border border-gray-100 space-y-8">
                 <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Slide Factory</h2>
                 <div className="space-y-4">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-yellow-600">Select Core Topics</h3>
                   <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2">
                     {material.curriculum.map((lesson, idx) => (
                       <div key={idx} onClick={() => { if (selectedSlideTopics.includes(lesson.title)) setSelectedSlideTopics(prev => prev.filter(t => t !== lesson.title)); else setSelectedSlideTopics(prev => [...prev, lesson.title]); }} className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all cursor-pointer ${selectedSlideTopics.includes(lesson.title) ? 'bg-yellow-400 border-yellow-400 text-white shadow-md' : 'bg-gray-50 border-gray-100 hover:border-yellow-200'}`}><span className="text-[10px] font-black">{idx+1}</span><span className="text-[10px] font-black uppercase truncate">{lesson.title}</span></div>
                     ))}
                   </div>
                 </div>
                 <button onClick={handleGenerateSlides} disabled={selectedSlideTopics.length === 0} className="w-full py-4 bg-gray-900 text-white font-black rounded-2xl uppercase tracking-widest text-xs shadow-xl active:scale-95 disabled:opacity-20">Construct New Deck</button>
               </div>
               <div className="bg-gray-50 rounded-[32px] p-8 border border-gray-200 space-y-6">
                 <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2"><i className="fa-solid fa-folder-open"></i> Session Library</h3>
                 <div className="space-y-3">
                   {slideDecks.length === 0 ? (
                     <div className="py-20 flex flex-col items-center justify-center text-gray-300 gap-4 opacity-50"><i className="fa-solid fa-layer-group text-4xl"></i><p className="text-[9px] font-black uppercase">No decks yet</p></div>
                   ) : slideDecks.map(deck => (
                     <div key={deck.id} className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm group hover:border-yellow-400 transition-all">
                       <div className="flex-1 cursor-pointer" onClick={() => { setSlides(deck.slides); setCurrentSlideIdx(0); }}><h4 className="text-[11px] font-black text-gray-900 uppercase truncate">{deck.title}</h4><p className="text-[8px] font-black text-gray-400 mt-0.5">{deck.slides.length} SLIDES • {new Date(deck.timestamp).toLocaleTimeString()}</p></div>
                       <div className="flex gap-2"><button onClick={() => downloadPptx(deck)} className="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center hover:bg-yellow-400 hover:text-white transition-all shadow-sm"><i className="fa-solid fa-file-powerpoint text-xs"></i></button><button onClick={() => setSlideDecks(prev => prev.filter(d => d.id !== deck.id))} className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"><i className="fa-solid fa-trash text-xs"></i></button></div>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
          </div>
        );
      }

      if (slides.length === 0 && isGeneratingSlides) {
        return (
          <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto py-20">
             <BeeIcon className="w-20 h-20 text-yellow-400 animate-bounce" />
             <h2 className="text-2xl font-black text-gray-900 mt-6 uppercase">{slideGenerationStatus}</h2>
             <div className="w-48 bg-gray-100 h-1 rounded-full mt-4 overflow-hidden"><div className="h-full bg-yellow-400 transition-all" style={{ width: `${slideGenerationProgress}%` }}></div></div>
          </div>
        );
      }

      const currentSlide = slides[currentSlideIdx];
      return (
        <div className="h-[calc(100vh-80px)] w-full flex bg-gray-50 overflow-hidden relative">
           {!isFullscreen && (
             <div className="w-64 bg-white border-r border-gray-100 flex flex-col shadow-sm shrink-0">
                <div className="p-4 border-b border-gray-50 flex items-center justify-between"><h4 className="text-[9px] font-black uppercase tracking-widest text-gray-400">Current Deck</h4><button onClick={() => setShowAddSlideModal(true)} className="text-yellow-500 hover:text-yellow-600 transition-colors"><i className="fa-solid fa-plus-circle text-lg"></i></button></div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                   {slides.map((s, i) => (
                     <button key={i} onClick={() => setCurrentSlideIdx(i)} className={`w-full p-3 rounded-xl text-left border transition-all flex items-start gap-3 group ${currentSlideIdx === i ? 'bg-yellow-400 border-yellow-400 shadow-md' : 'bg-gray-50 border-gray-100 hover:bg-white'}`}><span className={`text-[8px] font-black tabular-nums mt-0.5 ${currentSlideIdx === i ? 'text-white' : 'text-gray-300'}`}>{(i+1).toString().padStart(2,'0')}</span><span className={`text-[10px] font-black uppercase truncate ${currentSlideIdx === i ? 'text-white' : 'text-gray-600'}`}>{s.title}</span></button>
                   ))}
                </div>
             </div>
           )}
           <div className="flex-1 flex flex-col items-center justify-center p-4 lg:p-10 relative">
              <div ref={slideContainerRef} className={`w-full max-w-5xl aspect-video bg-white rounded-[32px] lg:rounded-[48px] shadow-3xl border border-gray-100 overflow-hidden relative group/slide flex flex-col transition-all duration-500 ${isFullscreen ? 'max-w-none rounded-none border-none h-screen w-screen' : ''}`}>
                  <div className="absolute inset-0 opacity-[0.03] pointer-events-none overflow-hidden"><BeeIcon className="absolute -right-20 -top-20 w-[400px] h-[400px] rotate-12" /></div>
                  <div className="flex-1 flex flex-col p-8 md:p-12 lg:p-20 relative z-10 overflow-hidden">
                    <div className="flex items-center gap-3 mb-6 shrink-0"><div className="px-3 py-1 bg-yellow-400 text-white rounded-lg text-[9px] font-black uppercase">Slide {currentSlideIdx + 1} / {slides.length}</div><div className="h-[1px] flex-1 bg-gray-100"></div></div>
                    {currentSlide ? (
                      <div className="flex-1 flex flex-col justify-center animate-fade-in overflow-hidden">
                          <h2 className={`font-black text-gray-900 tracking-tighter leading-tight shrink-0 mb-8 lg:mb-12 ${isFullscreen ? 'text-4xl md:text-8xl' : 'text-2xl md:text-5xl lg:text-6xl'}`}><MathRenderer text={currentSlide.title} /></h2>
                          <div className={`flex-1 overflow-y-auto custom-scrollbar pr-4 flex flex-col justify-center space-y-6 lg:space-y-12 ${isFullscreen ? 'text-xl md:text-4xl' : 'text-base md:text-xl lg:text-2xl'}`}>{currentSlide.bullets.map((bullet, i) => (<div key={i} className="flex gap-4 items-start animate-slide-up" style={{ animationDelay: `${i * 0.1}s` }}><div className={`rounded-full bg-yellow-400 shrink-0 shadow-sm ${isFullscreen ? 'w-5 h-5 mt-4' : 'w-2.5 h-2.5 mt-3'}`}></div><div className="font-medium text-gray-700 leading-relaxed"><MathRenderer text={bullet} /></div></div>))}</div>
                          {currentSlide.visualPrompt && (<div className="mt-8 lg:mt-12 pt-6 border-t border-gray-50 flex items-center gap-3 shrink-0"><i className="fa-solid fa-wand-magic-sparkles text-yellow-500 text-sm"></i><p className="text-[9px] lg:text-[11px] text-gray-400 font-medium italic">Visual Concept: {currentSlide.visualPrompt}</p></div>)}
                      </div>
                    ) : null}
                  </div>
                  <div className="absolute bottom-6 right-6 flex items-center gap-3 z-50">
                    <button onClick={toggleFullscreen} className="w-10 h-10 rounded-xl bg-white/80 border border-gray-100 shadow-lg text-gray-400 hover:text-gray-900 flex items-center justify-center transition-all"><i className={`fa-solid ${isFullscreen ? 'fa-compress' : 'fa-expand'}`}></i></button>
                    <div className="w-[1px] h-6 bg-gray-100 mx-1"></div>
                    <button onClick={() => setCurrentSlideIdx(prev => Math.max(0, prev - 1))} disabled={currentSlideIdx === 0} className="w-10 h-10 rounded-xl bg-white/80 border border-gray-100 shadow-lg text-gray-400 hover:text-gray-900 flex items-center justify-center disabled:opacity-20"><i className="fa-solid fa-chevron-left"></i></button>
                    <button onClick={() => setCurrentSlideIdx(prev => Math.min(slides.length - 1, prev + 1))} disabled={currentSlideIdx === slides.length - 1} className="w-10 h-10 rounded-xl bg-yellow-400 text-white shadow-lg hover:scale-105 flex items-center justify-center disabled:opacity-20"><i className="fa-solid fa-chevron-right"></i></button>
                  </div>
              </div>
              {!isFullscreen && (
                <div className="flex gap-4 mt-8">
                  <button onClick={() => setShowAddSlideModal(true)} className="px-6 py-2.5 bg-yellow-50 text-yellow-600 font-black rounded-xl text-[10px] uppercase tracking-widest border border-yellow-100 hover:bg-yellow-400 hover:text-white transition-all shadow-md flex items-center gap-2"><i className="fa-solid fa-plus-circle"></i> Add Slide</button>
                  <button onClick={() => downloadPptx({ id: 'active', title: 'BeeStudy Presentation', slides, timestamp: Date.now() })} className="px-6 py-2.5 bg-green-50 text-green-600 font-black rounded-xl text-[10px] uppercase tracking-widest border border-green-100 hover:bg-green-500 hover:text-white transition-all shadow-md flex items-center gap-2"><i className="fa-solid fa-download"></i> Save as PPTX</button>
                  <button onClick={() => { setSlides([]); setIsGeneratingSlides(false); }} className="px-6 py-2.5 bg-gray-900 text-white font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-red-500 transition-colors shadow-lg">Close Deck</button>
                </div>
              )}
           </div>
           {showAddSlideModal && (
             <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-xl animate-fade-in">
               <div className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-3xl"><h3 className="text-xl font-black text-gray-900 mb-2 uppercase">New Slide</h3><input type="text" value={newSlideTopic} onChange={e => setNewSlideTopic(e.target.value)} placeholder="E.g. Technical limitations of..." className="w-full p-4 bg-gray-50 border rounded-2xl mb-4 font-bold text-sm" /><div className="flex flex-col gap-2"><button onClick={handleAddIndividualSlide} className="w-full py-4 bg-yellow-400 text-white font-black rounded-xl uppercase text-[10px]">Add to active deck</button><button onClick={() => setShowAddSlideModal(false)} className="w-full py-3 text-gray-400 font-black text-[8px] uppercase">Cancel</button></div></div>
             </div>
           )}
        </div>
      );
    }

    if (view === ViewType.LEARN) {
      const lesson = material.curriculum[currentLessonIdx];
      const lessonWords = lesson.content.split(/\s+/);
      const progressPercent = Math.round(((currentLessonIdx + 1) / material.curriculum.length) * 100);
      return (
        <div className="flex flex-col lg:flex-row h-screen lg:h-[calc(100vh-80px)] overflow-hidden animate-fade-in bg-[#fafafa]">
          {/* Main Learning Content */}
          <div className="flex-1 flex flex-col p-4 lg:p-8 overflow-hidden relative">
             <div className="flex items-center justify-between mb-8 px-2">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center font-black text-lg shadow-xl"><span className="text-yellow-400">L</span>{currentLessonIdx+1}</div>
                  <div className="min-w-0">
                    <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tighter truncate uppercase leading-tight">{lesson.title}</h2>
                    <div className="flex items-center gap-2 mt-0.5">
                       <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Progress: {progressPercent}%</span>
                       <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                         <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${progressPercent}%` }}></div>
                       </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl shadow-sm border">
                  <button onClick={() => { stopReading(); setCurrentLessonIdx(Math.max(0, currentLessonIdx - 1)); }} className="w-8 h-8 rounded-lg hover:bg-yellow-50 text-gray-400" disabled={currentLessonIdx === 0}><i className="fa-solid fa-chevron-left text-[10px]"></i></button>
                  <button onClick={() => { stopReading(); setCurrentLessonIdx(Math.min(material.curriculum.length - 1, currentLessonIdx + 1)); }} className="w-8 h-8 rounded-lg hover:bg-yellow-50 text-gray-400" disabled={currentLessonIdx === material.curriculum.length - 1}><i className="fa-solid fa-chevron-right text-[10px]"></i></button>
                </div>
             </div>

             <div className="flex-1 flex flex-col xl:flex-row gap-6 overflow-hidden">
                <div className="flex-1 bg-white rounded-[32px] shadow-sm border p-6 md:p-12 lg:p-16 overflow-y-auto custom-scrollbar relative">
                    <div className="max-w-4xl mx-auto pb-20">
                      <div className="flex items-center justify-between mb-8 border-b border-gray-50 pb-6">
                         <div className="space-y-1">
                           <span className="text-[8px] font-black uppercase text-yellow-600 tracking-widest">Educational Narrative</span>
                           <h4 className="text-xs font-bold text-gray-400 uppercase">Core Instructional Text</h4>
                         </div>
                         <div className="flex items-center gap-2">
                            {isReading || isPaused ? (
                              <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-lg">
                                <button onClick={isPaused ? playLessonAudio : pauseReading} className="px-4 py-1.5 bg-gray-900 text-white rounded-md text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">{isPaused ? <><i className="fa-solid fa-play"></i> Resume</> : <><i className="fa-solid fa-pause"></i> Pause</>}</button>
                                <button onClick={stopReading} className="w-8 h-8 bg-red-50 text-red-500 rounded-md hover:bg-red-500 hover:text-white transition-all"><i className="fa-solid fa-stop text-[10px]"></i></button>
                              </div>
                            ) : (
                              <button onClick={playLessonAudio} className="flex items-center gap-3 px-6 py-2.5 bg-yellow-400 text-white hover:bg-black rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95"><i className="fa-solid fa-volume-high"></i> Listen to Buzz</button>
                            )}
                         </div>
                      </div>

                      <div className="prose prose-sm md:prose-base max-w-none">
                        <div className="flex items-baseline gap-x-2 flex-wrap text-base md:text-lg text-gray-700 leading-[2] font-medium selection:bg-yellow-100">
                          {lessonWords.map((word, i) => (
                            <span key={i} className={`transition-all duration-200 inline-block px-1 rounded-md ${i === readingProgress && isReading ? 'reading-highlight' : ''}`}>
                              <MathRenderer text={word} />
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="p-6 bg-yellow-50/50 rounded-[24px] border border-yellow-100 flex gap-4 items-center group transition-all">
                             <div className="w-10 h-10 bg-yellow-400 rounded-xl flex items-center justify-center text-lg text-white shadow-md"><i className="fa-solid fa-lightbulb"></i></div>
                             <div className="space-y-0.5">
                               <h4 className="font-black text-yellow-600 text-[8px] uppercase tracking-widest">Master Concept</h4>
                               <p className="text-sm font-black text-gray-800 leading-tight italic">"{lesson.keyTakeaway}"</p>
                             </div>
                          </div>
                          <div className="p-6 bg-gray-50 rounded-[24px] border border-gray-100 flex gap-4 items-center group transition-all">
                             <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center text-lg text-white shadow-md"><i className="fa-solid fa-check-double"></i></div>
                             <div className="space-y-0.5">
                               <h4 className="font-black text-gray-400 text-[8px] uppercase tracking-widest">Key Objective</h4>
                               <p className="text-sm font-black text-gray-600 leading-tight">Apply this module's logic to practical testing.</p>
                             </div>
                          </div>
                      </div>
                    </div>
                </div>

                <div className="w-full xl:w-[320px] flex flex-col gap-6">
                   {/* Lesson Metadata Panel */}
                   <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-6 flex flex-col">
                      <h4 className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-4 flex items-center gap-2"><i className="fa-solid fa-list-check text-yellow-500"></i> Lesson Goals</h4>
                      <div className="space-y-3">
                         {lesson.objectives.map((obj, i) => (
                           <div key={i} className="flex gap-3 items-start">
                             <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mt-1.5 shrink-0"></div>
                             <span className="text-xs font-bold text-gray-600 leading-snug">{obj}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   {/* Glossary Mini Panel */}
                   <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 p-6 flex flex-col flex-1 overflow-hidden">
                      <h4 className="text-[9px] font-black uppercase text-gray-400 tracking-widest mb-4 flex items-center gap-2"><i className="fa-solid fa-spell-check text-yellow-500"></i> Glossary</h4>
                      <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                         {lesson.vocabulary.map((v, i) => (
                           <div key={i} className="p-3 bg-gray-50 rounded-xl border border-gray-50 hover:bg-white hover:border-yellow-200 transition-all group">
                              <span className="text-[10px] font-black text-gray-900 uppercase block mb-1 group-hover:text-yellow-600">{v.term}</span>
                              <p className="text-[10px] font-bold text-gray-400 leading-tight">{v.definition}</p>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
             </div>
          </div>
          
          <div className={`transition-all duration-500 bg-white border-l border-gray-100 flex flex-col shadow-xl relative ${isSidebarOpen ? 'w-full lg:w-[380px]' : 'w-0 overflow-hidden lg:w-0'}`}>
            <div className="p-5 border-b border-gray-50 flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <BeeIcon className="w-8 h-8" />
                 <h4 className="font-black text-sm uppercase tracking-tight">Buzz AI Tutor</h4>
               </div>
               <button onClick={() => setIsSidebarOpen(false)} className="text-gray-400 hover:text-gray-900 transition-colors"><i className="fa-solid fa-chevron-right"></i></button>
            </div>
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
               <div className="flex items-center gap-2">
                 <i className="fa-solid fa-stopwatch text-yellow-500 text-xs"></i>
                 <span className="text-lg font-black text-gray-900 font-mono tracking-tighter tabular-nums">{formatTime(timer)}</span>
               </div>
               <div className="flex gap-1.5">
                 <button onClick={() => setTimerActive(!timerActive)} className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${timerActive ? 'bg-red-500 text-white' : 'bg-gray-900 text-white'}`}>{timerActive ? 'Stop' : 'Focus'}</button>
                 <button onClick={resetTimer} className="w-8 h-8 rounded-lg bg-white border border-gray-100 text-gray-300 hover:text-gray-900 flex items-center justify-center"><i className="fa-solid fa-rotate-right text-[8px]"></i></button>
               </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-[#fcfcfc]">
              {chatHistory.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                  <div className={`max-w-[85%] p-3 rounded-xl ${msg.role === 'user' ? 'bg-gray-900 text-white rounded-br-none' : 'bg-white border text-gray-800 rounded-bl-none shadow-sm'}`}>
                    <MathRenderer text={msg.text} className="text-[11px] leading-relaxed font-medium" />
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border p-2.5 rounded-xl flex gap-1"><div className="w-1 h-1 bg-yellow-400 rounded-full animate-bounce"></div><div className="w-1 h-1 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.2s]"></div><div className="w-1 h-1 bg-yellow-400 rounded-full animate-bounce [animation-delay:0.4s]"></div></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="p-4 bg-white border-t border-gray-50">
               <div className="relative group">
                 <input type="text" value={userInput} onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMessage()} placeholder="Clarify this..." className="w-full p-2.5 pr-10 bg-gray-50 rounded-lg border border-transparent focus:border-yellow-400/30 focus:bg-white focus:outline-none transition-all font-bold text-[10px]" />
                 <button onClick={handleSendMessage} className="absolute right-1 top-1 bottom-1 w-8 bg-yellow-400 text-white rounded-md flex items-center justify-center active:scale-90 transition-all"><i className="fa-solid fa-paper-plane text-[10px]"></i></button>
               </div>
            </div>
          </div>
          {!isSidebarOpen && (
            <button onClick={() => setIsSidebarOpen(true)} className="absolute right-4 bottom-4 w-12 h-12 bg-gray-900 text-white rounded-2xl shadow-2xl flex items-center justify-center hover:bg-black transition-all group z-50">
               <i className="fa-solid fa-comment-dots group-hover:scale-110"></i>
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col lg:flex-row h-[calc(100vh-80px)] overflow-hidden">
        {/* Formula Vault Sidebar - ALWAYS ACCESSIBLE FROM NOTES */}
        {view === ViewType.NOTES && material.formulas.length > 0 && (
          <div className={`transition-all duration-500 bg-white border-r border-gray-100 flex flex-col shadow-sm relative ${isFormulaSidebarOpen ? 'w-full lg:w-[320px]' : 'w-0 overflow-hidden'}`}>
             <div className="p-4 border-b flex items-center justify-between">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-900">Formula Vault</h4>
                <button onClick={() => setIsFormulaSidebarOpen(false)} className="text-gray-300"><i className="fa-solid fa-xmark text-xs"></i></button>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50/30">
                {material.formulas.map((f, i) => (
                  <div key={i} className="p-4 bg-white rounded-2xl border space-y-3 shadow-sm hover:shadow-md transition-all">
                     <p className="text-[9px] font-black uppercase text-yellow-600">{f.name}</p>
                     <MathRenderer text={f.formula} className="text-center bg-gray-50/50 py-4 rounded-xl" />
                     <MathRenderer text={f.parameters} className="text-[9px] text-gray-500 font-medium leading-relaxed" />
                  </div>
                ))}
             </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-12 custom-scrollbar">
          {view === ViewType.NOTES && (
            <div className="max-w-4xl mx-auto mb-8 animate-fade-in">
               <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-gray-100">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-yellow-600 mb-4 flex items-center gap-2"><i className="fa-solid fa-folder-open"></i> Linked Documents</h3>
                  <div className="flex flex-wrap gap-2">
                     {material.sources?.map((s, i) => (
                       <div key={i} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg flex items-center gap-2 hover:bg-white hover:border-yellow-200 transition-all cursor-default">
                          <i className="fa-solid fa-file-lines text-gray-300 text-[10px]"></i>
                          <span className="text-[9px] font-black text-gray-500 truncate max-w-[200px]">{s}</span>
                       </div>
                     )) || <span className="text-[9px] text-gray-300 italic">No sources linked</span>}
                  </div>
               </div>
            </div>
          )}

          <div className="mb-10 text-center space-y-3">
             <h1 className="text-2xl md:text-4xl lg:text-5xl font-black text-gray-900 tracking-tighter leading-tight uppercase">{material.title}</h1>
             <div className="flex flex-wrap items-center justify-center gap-1.5">
               <span className="px-3 py-1 bg-yellow-100 text-yellow-700 font-black text-[7px] uppercase tracking-widest rounded-full">{view}</span>
               <span className="px-3 py-1 bg-gray-100 text-gray-500 font-black text-[7px] uppercase tracking-widest rounded-full">{config.difficulty} Mode</span>
             </div>
          </div>

          {view === ViewType.NOTES && (
            <div className="grid gap-4 max-w-4xl mx-auto animate-fade-in">
              {material.notes.map((note, idx) => (
                <div key={idx} className="flex gap-4 p-6 bg-white border rounded-[28px] shadow-sm hover:shadow-md transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-yellow-400 transition-colors">
                    <span className="text-sm font-black text-yellow-400 group-hover:text-white">{String(idx+1).padStart(2,'0')}</span>
                  </div>
                  <div className="text-base text-gray-700 font-bold leading-relaxed flex-1"><MathRenderer text={note} /></div>
                </div>
              ))}
            </div>
          )}
          {view === ViewType.FLASHCARDS && <FlashcardSet cards={material.flashcards} />}
          {view === ViewType.QUIZ && <Quiz questions={material.quiz} />}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfdfd] text-gray-900 selection:bg-yellow-100 font-['Ubuntu']">
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <nav className="sticky top-0 z-[100] h-14 md:h-16 bg-white/70 backdrop-blur-2xl border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer group shrink-0" onClick={() => material ? setShowResetConfirm(true) : setView(ViewType.HOME)}>
            <div className="w-8 h-8 md:w-10 md:h-10 bg-yellow-400 rounded-xl flex items-center justify-center shadow-lg group-hover:rotate-6 transition-all"><BeeIcon className="w-6 h-6 md:w-8 md:h-8" /></div>
            <span className="hidden sm:block text-sm md:text-base font-black text-gray-900 uppercase tracking-tighter">Bee Study</span>
          </div>
          {material && (
            <div className="hidden md:flex items-center gap-1.5 bg-gray-50/50 p-1.5 rounded-xl border border-gray-100 shadow-sm">
              <NavButton active={view === ViewType.NOTES} onClick={() => setView(ViewType.NOTES)} label="Study" icon="fa-note-sticky" />
              <NavButton active={view === ViewType.LEARN} onClick={() => setView(ViewType.LEARN)} label="Class" icon="fa-graduation-cap" highlight />
              <NavButton active={view === ViewType.SLIDES} onClick={() => setView(ViewType.SLIDES)} label="Slides" icon="fa-person-chalkboard" />
              {config.includeQuiz && <NavButton active={view === ViewType.QUIZ} onClick={() => setView(ViewType.QUIZ)} label="Test" icon="fa-bolt" />}
              {config.includeCards && <NavButton active={view === ViewType.FLASHCARDS} onClick={() => setView(ViewType.FLASHCARDS)} label="Recall" icon="fa-clone" />}
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {material && (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setShowAddModal(true)} className="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 flex items-center justify-center hover:bg-yellow-400 hover:text-white transition-all shadow-sm" title="Add Material"><i className="fa-solid fa-plus text-[10px]"></i></button>
                <button onClick={saveStudy} className="w-8 h-8 rounded-lg bg-gray-50 text-gray-400 flex items-center justify-center hover:bg-gray-900 hover:text-white transition-all shadow-sm" title="Download Hive"><i className="fa-solid fa-download text-[10px]"></i></button>
                <div className="w-[1px] h-6 bg-gray-100 mx-1"></div>
                <button onClick={() => setShowResetConfirm(true)} className="w-8 h-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm" title="End Session"><i className="fa-solid fa-power-off text-[10px]"></i></button>
              </div>
            )}
            <div className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center shadow-lg cursor-pointer hover:scale-105 transition-all"><i className="fa-solid fa-user text-xs"></i></div>
          </div>
        </div>
      </nav>
      <main className={`flex-1 overflow-hidden transition-all duration-700 ${showSplash ? 'blur-2xl opacity-0 scale-95' : 'blur-0 opacity-100 scale-100'}`}>{renderContent()}</main>
      
      {showAddModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-[32px] p-10 max-w-lg w-full shadow-3xl">
            <h3 className="text-xl font-black text-gray-900 uppercase mb-6 tracking-tighter">Expand Knowledge Hive</h3>
            <div onClick={() => document.getElementById('add-file-input')?.click()} className="py-12 border-2 border-dashed border-gray-100 rounded-[20px] flex flex-col items-center justify-center text-gray-400 hover:border-yellow-400 cursor-pointer transition-all group">
                <i className="fa-solid fa-file-arrow-up text-4xl mb-3 text-yellow-400 transition-transform group-hover:scale-110"></i>
                <p className="text-[9px] font-black uppercase tracking-widest">Integrate Context</p>
                <input id="add-file-input" type="file" multiple className="hidden" onChange={handleFileSelect} accept="image/*,.pdf,.txt" />
            </div>
            <button disabled={stagedFiles.length === 0 || loading} onClick={startAnalysis} className="w-full py-4 mt-4 bg-yellow-400 text-white font-black rounded-xl shadow-lg uppercase text-[10px] active:scale-95 disabled:opacity-30 tracking-[0.1em]">Integrate & Update</button>
            <button onClick={() => setShowAddModal(false)} className="w-full mt-2 text-gray-400 font-bold text-[8px] uppercase tracking-widest hover:text-gray-900 transition-colors">Cancel Expansion</button>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-[28px] p-8 max-w-sm w-full shadow-3xl text-center border border-gray-100">
            <div className="w-12 h-12 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center text-xl mx-auto mb-6 animate-pulse"><i className="fa-solid fa-triangle-exclamation"></i></div>
            <h3 className="text-xl font-black text-gray-900 mb-2 uppercase tracking-tighter">End Session?</h3>
            <p className="text-gray-500 mb-8 text-[10px] uppercase font-bold tracking-widest leading-relaxed">Your unsaved session data will be permanently cleared from the hive.</p>
            <div className="flex flex-col gap-2">
              <button onClick={() => setShowResetConfirm(false)} className="py-3 bg-gray-100 text-gray-400 rounded-lg font-black uppercase text-[8px] tracking-widest">Back to Study</button>
              <button onClick={confirmReset} className="py-3 bg-red-500 text-white rounded-lg font-black uppercase text-[8px] shadow-md tracking-widest active:scale-95 transition-all">Confirm Dissolve</button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes slide-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
};

const NavButton = ({ active, onClick, label, icon, highlight }: any) => (
  <button onClick={onClick} className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all duration-500 ${active ? (highlight ? 'bg-yellow-400 text-white shadow-md' : 'bg-white text-gray-900 shadow-sm border border-gray-100') : 'text-gray-400 hover:text-gray-900 hover:bg-white/30'}`}>
    <i className={`fa-solid ${icon} transition-transform ${active ? 'scale-110' : ''}`}></i> <span>{label}</span>
  </button>
);

export default App;
