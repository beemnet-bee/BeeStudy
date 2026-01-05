
import React, { useState, useMemo, useEffect, useRef } from 'react';
import katex from 'katex';
import { Flashcard } from '../types';

interface FlashcardSetProps {
  cards: Flashcard[];
}

const MathRenderer: React.FC<{ text: string }> = ({ text }) => {
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

  return <div ref={containerRef} />;
};

const FlashcardSet: React.FC<FlashcardSetProps> = ({ cards: initialCards }) => {
  const [cards, setCards] = useState<Flashcard[]>(initialCards.map(c => ({ ...c, srsLevel: c.srsLevel ?? 0 })));
  const [currentIndex, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [direction, setDirection] = useState<'left' | 'right' | null>(null);

  const masteryPercent = useMemo(() => {
    const totalLevel = cards.reduce((acc, c) => acc + (c.srsLevel || 0), 0);
    const maxPossible = cards.length * 3;
    return Math.round((totalLevel / maxPossible) * 100);
  }, [cards]);

  const handleNext = () => {
    setDirection('right');
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev + 1) % cards.length);
      setDirection(null);
    }, 400);
  };

  const handlePrev = () => {
    setDirection('left');
    setIsFlipped(false);
    setTimeout(() => {
      setCurrentIdx((prev) => (prev - 1 + cards.length) % cards.length);
      setDirection(null);
    }, 400);
  };

  const rateCard = (level: number) => {
    const newCards = [...cards];
    newCards[currentIndex] = { ...newCards[currentIndex], srsLevel: level, lastReviewed: Date.now() };
    setCards(newCards);
    if (level >= 2) {
      setTimeout(handleNext, 300);
    }
  };

  const shuffleDeck = () => {
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setCurrentIdx(0);
    setIsFlipped(false);
  };

  if (!cards || cards.length === 0) return null;
  const currentCard = cards[currentIndex];

  const srsButtons = [
    { label: 'Again', level: 0, color: 'bg-red-500', icon: 'fa-rotate-left' },
    { label: 'Hard', level: 1, color: 'bg-orange-500', icon: 'fa-circle-xmark' },
    { label: 'Good', level: 2, color: 'bg-blue-500', icon: 'fa-thumbs-up' },
    { label: 'Easy', level: 3, color: 'bg-green-500', icon: 'fa-bolt' },
  ];

  return (
    <div className="flex flex-col items-center gap-6 md:gap-10 py-6 md:py-8 animate-fade-in overflow-hidden">
      {/* SRS Stats Bar */}
      <div className="w-full max-w-2xl flex flex-col md:flex-row items-center justify-between px-5 py-3 bg-white rounded-2xl md:rounded-3xl shadow-xl border border-gray-100 gap-4 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-400/10 flex items-center justify-center text-yellow-600">
            <i className="fa-solid fa-brain text-base"></i>
          </div>
          <div className="text-left">
            <p className="text-[7px] font-black text-gray-400 uppercase tracking-widest">Retention</p>
            <p className="text-sm font-black text-gray-900">{masteryPercent}%</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 flex-1 mx-0 md:mx-6 w-full md:w-auto">
           <div className="h-1 flex-1 bg-gray-50 rounded-full overflow-hidden">
             <div className="h-full bg-yellow-400 transition-all duration-700" style={{ width: `${masteryPercent}%` }}></div>
           </div>
           <button 
             onClick={shuffleDeck}
             className="px-3 py-1 bg-gray-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-black transition-colors"
           >
             Shuffle
           </button>
        </div>

        <div className="text-right tabular-nums">
           <span className="text-base font-black text-gray-900 font-mono tracking-tighter">{currentIndex + 1}</span>
           <span className="text-gray-300 mx-1">/</span>
           <span className="text-xs font-black text-gray-300 font-mono">{cards.length}</span>
        </div>
      </div>

      <div className="relative group perspective-1000 w-full flex justify-center h-[320px] md:h-[380px]">
        <div 
          className={`relative w-[260px] md:w-[340px] h-full cursor-pointer transition-all duration-500 cubic-bezier(0.2, 1, 0.3, 1) ${direction === 'right' ? 'translate-x-20 rotate-12 opacity-0' : direction === 'left' ? '-translate-x-20 -rotate-12 opacity-0' : 'translate-x-0 opacity-100'}`}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          <div className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
            {/* Front */}
            <div className="absolute w-full h-full backface-hidden bg-white border border-gray-100 rounded-[28px] md:rounded-[36px] shadow-lg flex flex-col items-center justify-center p-6 md:p-8 text-center overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400"></div>
              <span className="absolute top-4 left-6 text-[8px] font-black text-yellow-500 uppercase tracking-[0.3em]">Recall</span>
              <div className="text-lg md:text-xl lg:text-2xl font-black text-gray-900 leading-tight tracking-tight px-4">
                <MathRenderer text={currentCard.front} />
              </div>
              
              <div className="absolute bottom-6 flex flex-col items-center gap-1 opacity-20">
                <i className="fa-solid fa-rotate text-xs"></i>
                <span className="text-[7px] font-black uppercase tracking-widest">Flip Card</span>
              </div>
            </div>

            {/* Back */}
            <div className="absolute w-full h-full backface-hidden bg-gray-900 rounded-[28px] md:rounded-[36px] shadow-2xl flex flex-col items-center justify-center p-6 md:p-8 text-center rotate-y-180 border-[5px] border-yellow-400">
              <span className="absolute top-4 left-6 text-[8px] font-black text-yellow-400 uppercase tracking-[0.3em]">Knowledge</span>
              <div className="max-h-[50%] overflow-y-auto custom-scrollbar pr-2 mb-8">
                <div className="text-base md:text-lg lg:text-xl font-bold text-white leading-relaxed">
                  <MathRenderer text={currentCard.back} />
                </div>
              </div>

              {/* SRS Rating Buttons */}
              <div className="absolute bottom-4 left-0 right-0 px-3 flex justify-between gap-1">
                {srsButtons.map((btn) => (
                  <button
                    key={btn.level}
                    onClick={(e) => { e.stopPropagation(); rateCard(btn.level); }}
                    className={`flex-1 flex flex-col items-center gap-1 py-1.5 rounded-lg transition-all active:scale-90 ${btn.color} ${currentCard.srsLevel === btn.level ? 'ring-2 ring-white' : 'opacity-80 hover:opacity-100'}`}
                  >
                    <i className={`fa-solid ${btn.icon} text-white text-[9px]`}></i>
                    <span className="text-white text-[7px] font-black uppercase tracking-tighter">{btn.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 md:gap-10">
        <button 
          onClick={handlePrev}
          className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-white border border-gray-100 shadow-md text-gray-300 hover:text-yellow-600 transition-all flex items-center justify-center"
        >
          <i className="fa-solid fa-chevron-left text-xs md:text-sm"></i>
        </button>
        <div className="flex flex-col items-center">
           <div className="flex items-baseline gap-1">
             <span className="text-xl md:text-2xl font-black text-gray-900 tracking-tighter tabular-nums">{currentIndex + 1}</span>
             <span className="text-xs md:text-sm font-black text-gray-200">/ {cards.length}</span>
           </div>
        </div>
        <button 
          onClick={handleNext}
          className="w-10 h-10 md:w-12 md:h-12 rounded-lg md:rounded-xl bg-white border border-gray-100 shadow-md text-gray-300 hover:text-yellow-600 transition-all flex items-center justify-center"
        >
          <i className="fa-solid fa-chevron-right text-xs md:text-sm"></i>
        </button>
      </div>
    </div>
  );
};

export default FlashcardSet;
