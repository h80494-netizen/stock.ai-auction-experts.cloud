'use client';

import React, { useState } from 'react';
import ChangePasswordModal from './ChangePasswordModal';

interface PrivateAccessGateProps {
  onAuthenticate: (authenticated: boolean) => void;
}

export default function PrivateAccessGate({ onAuthenticate }: PrivateAccessGateProps) {
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 모달 상태
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);

  // 신청 폼 상태
  const [signupForm, setSignupForm] = useState({
    name: '',
    phone: '',
    email: '',
    requested_password: ''
  });
  const [signupMsg, setSignupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 비밀번호 확인 및 로그인 처리
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const trimmedPassword = password.trim();
    if (!trimmedPassword) {
      setErrorMsg('비밀번호를 입력해 주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: trimmedPassword })
      });

      const data = await res.json();
      if (res.ok && data.authenticated) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('stock_terminal_auth', 'true');
          if (data.is_admin) {
            sessionStorage.setItem('stock_terminal_is_admin', 'true');
          } else {
            sessionStorage.removeItem('stock_terminal_is_admin');
          }
          if (data.name) {
            sessionStorage.setItem('stock_terminal_user_name', data.name);
          }
          localStorage.removeItem('stock_terminal_auth');
        }
        onAuthenticate(true);
      } else {
        setErrorMsg(data.detail || '올바르지 않거나 아직 승인되지 않은 비밀번호입니다.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('서버와 통신 중 오류가 발생했거나 승인되지 않은 비밀번호입니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 가입 및 비밀번호 신청 제출
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);

    if (!signupForm.name.trim() || !signupForm.phone.trim() || !signupForm.requested_password.trim()) {
      setSignupMsg({ type: 'error', text: '성함, 연락처, 사용 희망 비밀번호를 입력해 주세요.' });
      return;
    }

    try {
      const res = await fetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signupForm)
      });
      const data = await res.json();
      if (res.ok) {
        setSignupMsg({ type: 'success', text: data.message || '가입 신청이 완료되었습니다. 관리자 승인 후 접속 가능합니다.' });
        setSignupForm({ name: '', phone: '', email: '', requested_password: '' });
      } else {
        setSignupMsg({ type: 'error', text: data.detail || '신청 등록 중 오류가 발생했습니다.' });
      }
    } catch (err) {
      console.error(err);
      setSignupMsg({ type: 'error', text: '서버와 통신할 수 없습니다.' });
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
            <li>정식 승인 회원: 가입 신청 후 주인장 승인을 받은 고유 비밀번호 입력</li>
            <li>주인장/관리자: 관리자 마스터 비밀번호로 접속하여 시스템 관리</li>
          </ul>
        </div>

        {/* Input Form */}
        <form onSubmit={handleLogin} className="space-y-4 pt-1">
          <div>
            <input
              type="password"
              placeholder="비밀번호 입력 (승인받은 고유 비밀번호)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1b1c23] border border-gray-700/80 focus:border-cyan-500 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-500 outline-none transition-all shadow-inner font-mono"
              autoFocus
            />
          </div>

          {errorMsg && (
            <div className="text-red-400 text-xs text-center font-semibold bg-red-950/40 border border-red-800/60 p-2.5 rounded-lg">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-white hover:bg-gray-200 disabled:bg-gray-600 text-black font-extrabold text-base py-3.5 rounded-xl transition-all shadow-lg active:scale-[0.99] cursor-pointer"
          >
            {isLoading ? '검증 중...' : '입장하기'}
          </button>
        </form>

        {/* Bottom Sub Action Buttons Grid */}
        <div className="space-y-2.5 pt-2">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                setSignupMsg(null);
                setShowSignupModal(true);
              }}
              className="bg-purple-950/40 hover:bg-purple-900/60 border border-purple-600/50 text-purple-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>👤+</span>
              <span>가입/비밀번호 신청</span>
            </button>
            <button
              onClick={() => setShowChangePasswordModal(true)}
              className="bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-600/50 text-cyan-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>🔑</span>
              <span>비밀번호 변경</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => setShowContactModal(true)}
              className="bg-teal-950/40 hover:bg-teal-900/60 border border-teal-600/50 text-teal-200 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>💬</span>
              <span>소통 및 문의란</span>
            </button>
            <button
              onClick={() => setShowDonationModal(true)}
              className="bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/50 text-amber-300 font-bold py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span>☕</span>
              <span>서버 운영 후원</span>
            </button>
          </div>
        </div>

      </div>

      {/* 1. 가입/비밀번호 신청 모달 */}
      {showSignupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121318] border border-purple-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative">
            <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2">
              <span>👤+</span>
              <span>가입 및 승인 비밀번호 신청</span>
            </h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              성함과 개인정보를 작성하여 승인 요청을 등록해 주세요.<br/>
              관리자(주인장) 승인 후 요청하신 비밀번호로 접속이 가능합니다.
            </p>

            <form onSubmit={handleSignupSubmit} className="space-y-3 pt-2">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">성함 / 닉네임 *</label>
                <input
                  type="text"
                  placeholder="예: 홍길동"
                  value={signupForm.name}
                  onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">연락처 *</label>
                <input
                  type="text"
                  placeholder="예: 010-1234-5678"
                  value={signupForm.phone}
                  onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">이메일 (선택)</label>
                <input
                  type="email"
                  placeholder="예: user@example.com"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-[11px] text-gray-400 block mb-1">사용 희망 고유 비밀번호 *</label>
                <input
                  type="password"
                  placeholder="사용하고자 하는 비밀번호 (4자리 이상)"
                  value={signupForm.requested_password}
                  onChange={(e) => setSignupForm({ ...signupForm, requested_password: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>

              {signupMsg && (
                <div className={`text-xs p-2.5 rounded-lg border font-semibold ${
                  signupMsg.type === 'success' 
                    ? 'bg-emerald-950/50 border-emerald-700/60 text-emerald-300' 
                    : 'bg-red-950/50 border-red-700/60 text-red-300'
                }`}>
                  {signupMsg.text}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignupModal(false)}
                  className="w-1/3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2 rounded-xl text-xs transition-all"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  className="w-2/3 bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded-xl text-xs transition-all shadow-lg"
                >
                  승인 요청하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. 비밀번호 변경 모달 */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
      />

      {/* 3. 소통 및 문의란 모달 */}
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

      {/* 4. 서버 운영 후원하기 모달 */}
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
