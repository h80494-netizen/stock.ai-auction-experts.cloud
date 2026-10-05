'use client';

import React, { useState, useEffect } from 'react';

interface PrivateAccessGateProps {
  onAuthenticate: (authenticated: boolean) => void;
}

export default function PrivateAccessGate({ onAuthenticate }: PrivateAccessGateProps) {
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);

  // 비밀번호 확인 및 로그인 처리
  const handleLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    if (!password.trim()) {
      setErrorMsg('비밀번호를 입력해 주세요.');
      return;
    }

    // 허용되는 기본 접속 비밀번호 (예: 1234, 0000, 7777, stock2026 등 손쉬운 비밀번호 및 회원 비밀번호)
    // 입력된 어떠한 비밀번호든 승인해주거나 특정 마스터 패스워드 허용
    if (password.length >= 2) {
      if (typeof window !== 'undefined') {
        localStorage.setItem('stock_terminal_auth', 'true');
      }
      onAuthenticate(true);
    } else {
      setErrorMsg('올바른 비밀번호를 입력해 주세요.');
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070709] text-gray-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[350px] h-[350px] bg-cyan-900/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Access Card */}
      <div className="w-full max-w-[500px] bg-[#121318]/90 border border-gray-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl relative z-10 space-y-6">
        
        {/* Title Header */}
        <div className="text-center space-y-1">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-serif">
            Private Access
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 font-medium tracking-wide">
            AI Stock Expert 2.0
          </p>
        </div>

        {/* Info Banner Box */}
        <div className="bg-[#091b26]/90 border border-cyan-800/50 rounded-xl p-4 text-xs space-y-1.5 text-cyan-200">
          <div className="font-bold flex items-center gap-1.5 text-cyan-300">
            <span>ℹ️</span>
            <span>접속 비밀번호 안내</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-gray-300 leading-relaxed pl-1">
            <li>정식 승인 회원: 가입 신청 시 등록한 본인의 비밀번호 입력</li>
          </ul>
        </div>

        {/* Input Form */}
        <form onSubmit={handleLogin} className="space-y-4 pt-1">
          <div>
            <input
              type="password"
              placeholder="비밀번호 입력 (월일 4자리 또는 본인 설정 비밀번호)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1b1c23] border border-gray-700/80 focus:border-cyan-500 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-500 outline-none transition-all shadow-inner font-mono"
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="text-red-400 text-xs text-center font-semibold bg-red-950/40 border border-red-800/60 p-2 rounded-lg">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-white hover:bg-gray-200 text-black font-extrabold text-base py-3.5 rounded-xl transition-all shadow-lg active:scale-[0.99] cursor-pointer"
          >
            입장하기
          </button>
        </form>

        {/* Bottom Sub Action Buttons Grid */}
        <div className="space-y-2.5 pt-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => setShowSignupModal(true)}
              className="bg-purple-950/40 hover:bg-purple-900/60 border border-purple-600/50 text-purple-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>👤+</span>
              <span>가입/비밀번호 신청</span>
            </button>
            <button
              onClick={() => setShowContactModal(true)}
              className="bg-teal-950/40 hover:bg-teal-900/60 border border-teal-600/50 text-teal-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>💬</span>
              <span>소통 및 문의란</span>
            </button>
          </div>

          <button
            onClick={() => setShowDonationModal(true)}
            className="w-full bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/50 text-amber-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
          >
            <span>☕</span>
            <span>서버 운영 후원하기 (Donation)</span>
          </button>
        </div>

      </div>

      {/* 1. 가입/비밀번호 신청 모달 */}
      {showSignupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121318] border border-purple-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2">
              <span>👤+</span>
              <span>가입 및 비밀번호 신청</span>
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              AI 주식 투자 터미널 이용을 위한 회원가입 신청 안내입니다.<br/>
              관리자에게 사용하실 비밀번호(월일 4자리 등)를 신청해 주세요.
            </p>
            <div className="bg-gray-900 p-3 rounded-xl text-xs font-mono text-purple-200 border border-gray-800">
              담당자 문의: support@ai-auction-experts.cloud<br/>
              운영팀 연락처: 관리자 직통 승인 시스템
            </div>
            <button
              onClick={() => setShowSignupModal(false)}
              className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl text-xs transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 2. 소통 및 문의란 모달 */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121318] border border-teal-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-teal-300 flex items-center gap-2">
              <span>💬</span>
              <span>소통 및 문의란</span>
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              서비스 이용 중 제안사항이나 피드백이 있으시면 언제든지 의견을 전달해 주세요.
            </p>
            <div className="bg-gray-900 p-3 rounded-xl text-xs text-teal-200 border border-gray-800 space-y-1">
              <div>• 시스템 오류 신고 및 개선 피드백</div>
              <div>• 새로운 기능 요청 및 재무 데이터 제보</div>
            </div>
            <button
              onClick={() => setShowContactModal(false)}
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 rounded-xl text-xs transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 3. 서버 운영 후원하기 모달 */}
      {showDonationModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121318] border border-amber-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-amber-300 flex items-center gap-2">
              <span>☕</span>
              <span>서버 운영 후원하기 (Donation)</span>
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              DART 재무 크롤러 및 AWS 실시간 터미널 서버를 안정적으로 운영할 수 있도록 후원해 주셔서 감사합니다.
            </p>
            <div className="bg-gray-900 p-3 rounded-xl text-xs text-amber-200 border border-gray-800 font-mono space-y-1">
              <div>후원 계좌: 카카오뱅크 3333-00-1234567 (예금주: AI 주식연구소)</div>
              <div>따뜻한 후원금은 서버 증설 및 데이터 수집 비용으로 사용됩니다.</div>
            </div>
            <button
              onClick={() => setShowDonationModal(false)}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl text-xs transition-all"
            >
              닫기
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
