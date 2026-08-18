"use client";

import { useState } from 'react';
import Link from 'next/link';
import { FiAward, FiCheckCircle, FiXCircle, FiRefreshCw, FiZap, FiLock, FiArrowRight, FiCheck } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

const QUIZ_QUESTIONS = [
  {
    id: 1,
    question: "When cutting hard river rock or 6000+ PSI reinforced concrete, what type of segment bond matrix should you select?",
    options: [
      { text: "Hard bond matrix to resist segment wear", correct: false, explanation: "Hard bond on hard concrete causes glazing — the matrix won't wear down to expose fresh diamonds." },
      { text: "Soft-to-medium bond matrix to continuously expose fresh diamond grit", correct: true, explanation: "Correct! Soft matrix bonds wear away at the ideal rate on hard aggregates, keeping fresh diamond edges exposed." },
      { text: "Electroplated single layer diamond matrix", correct: false, explanation: "Electroplated blades are for soft stone/tiles, not heavy concrete flat sawing." },
      { text: "Bond matrix type doesn't matter for hard concrete", correct: false, explanation: "Bond selection is the #1 factor in blade speed and footage life." }
    ]
  },
  {
    id: 2,
    question: "What is the primary purpose of slanted drop-segments (undercut protection) on asphalt blades?",
    options: [
      { text: "To make the blade look aggressive", correct: false, explanation: "Drop segments serve a crucial mechanical protection function." },
      { text: "To increase cutting speed in steel rebar", correct: false, explanation: "Drop segments are designed for abrasive materials like asphalt and green concrete." },
      { text: "To prevent abrasive sand slurry from eroding the steel core weld line", correct: true, explanation: "Correct! Highly abrasive asphalt slurry gouges steel cores under the weld line — drop segments shield the core." },
      { text: "To reduce saw motor noise", correct: false, explanation: "Drop segments do not affect acoustics." }
    ]
  },
  {
    id: 3,
    question: "If your diamond blade starts 'glazing' (smoothing over and refusing to cut), what is the best jobsite fix?",
    options: [
      { text: "Throw the blade away immediately", correct: false, explanation: "Glazed blades can easily be dressed and reactivated." },
      { text: "Cut into an abrasive material like soft cinder block or asphalt to expose fresh diamonds", correct: true, explanation: "Correct! Dressing the blade in an abrasive material strips off the dull metal matrix and opens fresh diamonds." },
      { text: "Increase saw RPM to 15,000 RPM", correct: false, explanation: "Exceeding max RPM is dangerous and causes core warping." },
      { text: "Spray soapy water directly onto the arbor", correct: false, explanation: "Lubricating the arbor does not sharpen segment diamonds." }
    ]
  },
  {
    id: 4,
    question: "What is the optimal Surface Feet Per Minute (SFPM) speed range for wet cutting concrete?",
    options: [
      { text: "1,000 - 2,000 SFPM", correct: false, explanation: "Too slow — causes segment pounding and premature wear." },
      { text: "9,500 - 12,500 SFPM", correct: true, explanation: "Correct! 9,500 - 12,500 SFPM is the industry sweet spot for diamond segment impact and heat dissipation." },
      { text: "25,000 - 30,000 SFPM", correct: false, explanation: "Way too fast — will cause segment throw and core fatigue failure." },
      { text: "Speed doesn't depend on diameter", correct: false, explanation: "RPM must be calculated based on blade diameter to match SFPM." }
    ]
  },
  {
    id: 5,
    question: "How does ZENESIS™ 3D Patterned Diamond Technology differ from random diamond distribution?",
    options: [
      { text: "Diamonds are arranged in precise 3D grid rows so every diamond cuts continuously", correct: true, explanation: "Correct! Patterned 3D grid layout reduces saw drag and increases cut speed by up to 50%." },
      { text: "It uses synthetic ruby instead of industrial diamond", correct: false, explanation: "ZENESIS™ uses premium industrial diamond crystals." },
      { text: "It requires dry cutting only", correct: false, explanation: "ZENESIS™ works exceptionally well in both wet and dry applications." },
      { text: "There is no performance difference", correct: false, explanation: "Patterned alignment dramatically outperforms random diamond clustering." }
    ]
  }
];

export default function KnowledgeTestPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [showResults, setShowResults] = useState(false);

  const handleSelectOption = (optionIdx: number) => {
    const updated = [...selectedAnswers];
    updated[currentStep] = optionIdx;
    setSelectedAnswers(updated);
  };

  const handleNext = () => {
    if (currentStep < QUIZ_QUESTIONS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowResults(true);
    }
  };

  const calculateScore = () => {
    let score = 0;
    QUIZ_QUESTIONS.forEach((q, idx) => {
      const selected = selectedAnswers[idx];
      if (selected !== undefined && q.options[selected].correct) {
        score += 1;
      }
    });
    return score;
  };

  const score = calculateScore();
  const percentage = Math.round((score / QUIZ_QUESTIONS.length) * 100);

  return (
    <div className="bg-neutral-950 text-white min-h-screen relative overflow-hidden">
      <SparkCanvas />

      {/* Header Banner */}
      <section className="py-16 bg-gradient-to-b from-neutral-900/90 via-neutral-950 to-neutral-950 border-b border-white/10 text-center relative z-10">
        <div className="max-w-4xl mx-auto px-4">
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-4 py-1.5 rounded-full mb-4">
            <FiAward className="text-amber-400" size={16} />
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              CONTRACTOR CERTIFICATION QUIZ
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight mb-4 text-white">
            CONCRETE CUTTING KNOWLEDGE TEST
          </h1>
          <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
            Test your diamond blade expertise! Score 80%+ to unlock your official <strong className="text-amber-400">Titan Certified Specialist Badge</strong> and an exclusive 15% contractor discount code.
          </p>
        </div>
      </section>

      {/* Quiz Body */}
      <div className="max-w-3xl mx-auto px-4 py-12 relative z-10">
        {!showResults ? (
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
            {/* Progress Bar */}
            <div className="flex items-center justify-between text-xs font-mono text-neutral-400 mb-6">
              <span>QUESTION {currentStep + 1} OF {QUIZ_QUESTIONS.length}</span>
              <span className="text-amber-400 font-bold">{Math.round(((currentStep + 1) / QUIZ_QUESTIONS.length) * 100)}% COMPLETE</span>
            </div>
            <div className="w-full bg-neutral-950 h-2 rounded-full mb-8 overflow-hidden">
              <div 
                className="bg-gradient-to-r from-amber-500 to-orange-600 h-full transition-all duration-500"
                style={{ width: `${((currentStep + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
              />
            </div>

            {/* Question */}
            <h2 className="text-xl sm:text-2xl font-black text-white mb-6 leading-snug">
              {QUIZ_QUESTIONS[currentStep].question}
            </h2>

            {/* Options */}
            <div className="space-y-4 mb-8">
              {QUIZ_QUESTIONS[currentStep].options.map((opt, idx) => {
                const isSelected = selectedAnswers[currentStep] === idx;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectOption(idx)}
                    className={`w-full text-left p-5 rounded-2xl border transition-all flex items-start gap-4 ${
                      isSelected 
                        ? 'bg-amber-500/20 border-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]' 
                        : 'bg-neutral-950/60 border-white/10 hover:border-white/20 text-neutral-300'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border mt-0.5 text-xs font-bold ${
                      isSelected ? 'bg-amber-500 border-amber-400 text-neutral-950' : 'border-neutral-700 text-neutral-500'
                    }`}>
                      {String.fromCharCode(65 + idx)}
                    </div>
                    <span className="text-sm leading-relaxed">{opt.text}</span>
                  </button>
                );
              })}
            </div>

            {/* Navigation Button */}
            <button
              onClick={handleNext}
              disabled={selectedAnswers[currentStep] === undefined}
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-950 font-black text-sm uppercase tracking-wider py-4 rounded-2xl transition-all shadow-lg text-center flex items-center justify-center gap-2"
            >
              {currentStep < QUIZ_QUESTIONS.length - 1 ? 'Next Question →' : 'View Certification Score 🎉'}
            </button>
          </div>
        ) : (
          /* Results Card */
          <div className="bg-neutral-900/90 backdrop-blur-xl border border-amber-500/40 rounded-3xl p-8 sm:p-12 text-center shadow-[0_0_60px_rgba(245,158,11,0.15)]">
            <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl text-neutral-950 font-black text-3xl">
              🏆
            </div>

            <span className="text-xs font-mono font-bold uppercase tracking-widest text-amber-400 block mb-2">
              QUIZ RESULTS & CERTIFICATION
            </span>
            <h2 className="text-4xl font-black uppercase text-white mb-2">
              {percentage >= 80 ? "CERTIFIED SPECIALIST!" : "TEST COMPLETED!"}
            </h2>
            <p className="text-neutral-400 text-sm mb-6">
              You answered <strong className="text-white">{score} out of {QUIZ_QUESTIONS.length}</strong> questions correctly ({percentage}%).
            </p>

            {percentage >= 80 && (
              <div className="bg-neutral-950 border border-amber-500/40 rounded-2xl p-6 mb-8 text-left space-y-3">
                <div className="flex items-center gap-3 text-amber-400 font-bold text-sm uppercase tracking-wider border-b border-white/10 pb-3">
                  <FiCheckCircle size={20} />
                  <span>SPECIALIST DISCOUNT UNLOCKED!</span>
                </div>
                <p className="text-xs text-neutral-300">Use promo code below at checkout or mention to your sales rep for 15% off your next order:</p>
                <div className="bg-amber-500/20 border border-amber-500/50 p-3.5 rounded-xl text-center font-mono font-black text-xl text-amber-300 tracking-widest">
                  TITANPRO15
                </div>
              </div>
            )}

            {/* Explanations */}
            <div className="text-left space-y-4 mb-8">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Answer Breakdown:</h3>
              {QUIZ_QUESTIONS.map((q, idx) => {
                const userAns = selectedAnswers[idx];
                const isCorrect = userAns !== undefined && q.options[userAns].correct;
                return (
                  <div key={idx} className="bg-neutral-950 p-4 rounded-xl border border-white/5 text-xs">
                    <div className="flex items-start gap-2 font-bold mb-1">
                      {isCorrect ? <FiCheckCircle className="text-emerald-400 shrink-0 mt-0.5" /> : <FiXCircle className="text-red-400 shrink-0 mt-0.5" />}
                      <span className="text-white">{q.question}</span>
                    </div>
                    <p className="text-neutral-400 pl-6">{q.options[userAns || 0]?.explanation}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => {
                  setCurrentStep(0);
                  setSelectedAnswers([]);
                  setShowResults(false);
                }}
                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs py-3.5 rounded-xl border border-white/10 flex items-center justify-center gap-2"
              >
                <FiRefreshCw /> Retake Knowledge Test
              </button>
              <Link
                href="/shop"
                className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-3.5 rounded-xl text-center block"
              >
                Browse Diamond Catalog →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
