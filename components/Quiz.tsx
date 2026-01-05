
import React, { useState, useEffect, useRef } from 'react';
import katex from 'katex';
import { QuizQuestion } from '../types';

interface QuizProps {
  questions: QuizQuestion[];
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

const Quiz: React.FC<QuizProps> = ({ questions }) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const handleOptionSelect = (idx: number) => {
    if (showExplanation) return;
    setSelectedOption(idx);
    setShowExplanation(true);
    if (idx === questions[currentIdx].correctAnswer) {
      setScore(score + 1);
    }
  };

  const handleNext = () => {
    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      setFinished(true);
    }
  };

  const reset = () => {
    setCurrentIdx(0);
    setSelectedOption(null);
    setShowExplanation(false);
    setScore(0);
    setFinished(false);
  };

  if (finished) {
    const grade = (score / questions.length) * 100;
    return (
      <div className="max-w-xl mx-auto text-center py-10 md:py-16 bg-white rounded-[32px] md:rounded-[48px] shadow-2xl border border-gray-100 px-6 md:px-10 animate-slide-up">
        <div className="text-5xl md:text-6xl animate-bounce mb-6">🐝</div>
        <h2 className="text-2xl md:text-4xl font-black text-gray-900 mb-2 tracking-tighter">Hive Extracted!</h2>
        <p className="text-sm md:text-base text-gray-400 mb-8 md:mb-12 font-medium">You've successfully pollinated your mind.</p>
        
        <div className="relative inline-block w-full p-8 md:p-12 rounded-[24px] md:rounded-[36px] bg-gray-50 border border-gray-100 mb-8 md:mb-12">
          <div className="flex flex-col items-center">
            <span className="text-[9px] font-black text-yellow-600 uppercase tracking-widest mb-3">Scorecard</span>
            <div className="text-5xl md:text-6xl font-black text-gray-900 tracking-tighter mb-1">
              {score}<span className="text-xl md:text-2xl text-gray-300 font-bold ml-1">/ {questions.length}</span>
            </div>
            <span className="text-sm md:text-base font-black text-yellow-500 uppercase tracking-widest">{grade >= 80 ? 'Elite Scholar' : grade >= 50 ? 'Steady Worker' : 'Keep Training'}</span>
          </div>
        </div>

        <button 
          onClick={reset}
          className="w-full max-w-xs py-4 md:py-5 bg-gray-900 text-white font-black text-base md:text-lg rounded-2xl md:rounded-3xl transition-all hover:scale-105 active:scale-95 uppercase tracking-widest"
        >
          Retry Test
        </button>
      </div>
    );
  }

  const q = questions[currentIdx];

  return (
    <div className="max-w-3xl mx-auto py-6 md:py-10 animate-fade-in px-4">
      <div className="flex justify-between items-end mb-6 md:mb-10 px-2">
        <div className="space-y-1">
          <span className="text-[9px] font-black text-yellow-600 uppercase tracking-widest">Question {currentIdx + 1}</span>
          <h4 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight">The Challenge</h4>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="h-1.5 w-24 md:w-32 bg-gray-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-yellow-400 transition-all duration-700" 
              style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[28px] md:rounded-[44px] shadow-lg border border-gray-100 p-6 md:p-12 mb-6">
        <div className="text-lg md:text-2xl font-black text-gray-900 mb-8 md:mb-12 leading-tight tracking-tight">
          <MathRenderer text={q.question} />
        </div>
        
        <div className="grid gap-3 md:gap-4">
          {q.options.map((opt, i) => {
            let bgColor = "bg-gray-50 border-gray-50 hover:border-yellow-200";
            let textColor = "text-gray-800";
            let indicator = "bg-white border-gray-100 text-gray-300";

            if (showExplanation) {
              if (i === q.correctAnswer) {
                bgColor = "bg-green-50 border-green-200";
                textColor = "text-green-900";
                indicator = "bg-green-500 border-green-500 text-white";
              } else if (i === selectedOption) {
                bgColor = "bg-red-50 border-red-100 opacity-60";
                textColor = "text-red-900";
                indicator = "bg-red-500 border-red-500 text-white";
              } else {
                bgColor = "bg-gray-50 opacity-40 grayscale";
              }
            }

            return (
              <button
                key={i}
                disabled={showExplanation}
                onClick={() => handleOptionSelect(i)}
                className={`w-full text-left p-4 md:p-5 rounded-xl md:rounded-2xl border-2 transition-all flex items-center font-bold text-sm md:text-base ${bgColor} ${textColor}`}
              >
                <span className={`w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl border flex items-center justify-center mr-4 text-[10px] md:text-xs font-black shrink-0 ${indicator}`}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">
                  <MathRenderer text={opt} />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showExplanation && (
        <div className="space-y-4 md:space-y-6 animate-slide-up">
          <div className="bg-gray-900 rounded-[24px] md:rounded-[36px] p-6 md:p-10 text-white shadow-xl relative overflow-hidden">
            <h4 className="font-black text-yellow-400 mb-3 text-[9px] md:text-[10px] uppercase tracking-widest">
              Review
            </h4>
            <div className="text-sm md:text-base text-gray-100 leading-relaxed font-medium relative z-10">
              <MathRenderer text={q.explanation} />
            </div>
          </div>
          <button 
            onClick={handleNext}
            className="w-full py-4 md:py-6 bg-yellow-400 text-white font-black text-base md:text-lg rounded-2xl md:rounded-3xl shadow-xl flex items-center justify-center gap-3 transition-all active:scale-95 group"
          >
            <span>{currentIdx + 1 === questions.length ? "View Results" : "Next Problem"}</span>
            <i className="fa-solid fa-arrow-right text-xs group-hover:translate-x-2 transition-transform"></i>
          </button>
        </div>
      )}
    </div>
  );
};

export default Quiz;
