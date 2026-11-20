'use client';

import React, { useState, useRef } from 'react';
import ChangePasswordModal from './ChangePasswordModal';
import AdminApprovalModal from './AdminApprovalModal';

interface PrivateAccessGateProps {
  onAuthenticate: (authenticated: boolean) => void;
}

export default function PrivateAccessGate({ onAuthenticate }: PrivateAccessGateProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // 모달 상태
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);

  // 히든 관리자 모드 연속 클릭 감지 (3회 클릭 시 오픈)
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleSecretAdminTrigger = () => {
    clickCountRef.current += 1;
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

    if (clickCountRef.current >= 3) {
      clickCountRef.current = 0;
      setShowAdminModal(true);
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickCountRef.current = 0;
      }, 1000);
    }
  };

  // 회원가입 폼 상태 (ID + 패스워드 + 가입자 이메일 인증)
  const [signupForm, setSignupForm] = useState({
    login_id: '',
    requested_password: '',
    confirm_password: '',
    email: '',
    verification_code: '',
    name: '',
    phone: '',
  });
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [signupSubmitting, setSignupSubmitting] = useState(false);
  const [signupMsg, setSignupMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // ID + 비밀번호 확인 및 로그인 처리
  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const trimmedId = loginId.trim();
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
        body: JSON.stringify({
          login_id: trimmedId,
          password: trimmedPassword,
        }),
      });

      const data = await res.json();
      if (res.ok && data.authenticated) {
        if (typeof window !== 'undefined') {
          const resolvedUserId = data.user_id || (data.is_admin ? 'admin' : 'guest');
          sessionStorage.setItem('stock_terminal_auth', 'true');
          sessionStorage.setItem('stock_terminal_user_id', resolvedUserId);
          if (data.is_admin) {
            sessionStorage.setItem('stock_terminal_is_admin', 'true');
          } else {
            sessionStorage.removeItem('stock_terminal_is_admin');
            localStorage.removeItem('saved_holdings_data');
            localStorage.removeItem('saved_ledger_history');
            localStorage.removeItem('saved_detailed_trading_ledger');
            localStorage.removeItem('saved_pnl_history');
          }
          if (data.name) {
            sessionStorage.setItem('stock_terminal_user_name', data.name);
          }
          localStorage.removeItem('stock_terminal_auth');
        }
        onAuthenticate(true);
      } else {
        setErrorMsg(data.detail || '아이디(ID) 또는 비밀번호가 올바르지 않습니다.');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 1단계: 이메일로 6자리 인증번호 발송
  const handleSendEmailCode = async () => {
    const cleanEmail = signupForm.email.trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setSignupMsg({ type: 'error', text: '인증번호를 받을 유효한 이메일 주소를 입력해 주세요.' });
      return;
    }

    setSendingCode(true);
    setSignupMsg(null);
    setEmailVerified(false);
    try {
      const res = await fetch('/api/auth/send-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailCodeSent(true);
        if (data.fallback_code) {
          setSignupForm((prev) => ({ ...prev, verification_code: String(data.fallback_code) }));
        }
        setSignupMsg({
          type: 'info',
          text: data.message || `${cleanEmail} 주소로 6자리 인증번호가 발송되었습니다.`,
        });
      } else {
        setSignupMsg({
          type: 'error',
          text: data.detail || data.message || '인증번호 발송 중 오류가 발생했습니다.',
        });
      }
    } catch (err) {
      console.error(err);
      setSignupMsg({ type: 'error', text: '인증번호 발송 서버 통신 실패' });
    } finally {
      setSendingCode(false);
    }
  };

  // 2단계: 이메일 6자리 인증번호 확인
  const handleVerifyEmailCode = async () => {
    const cleanEmail = signupForm.email.trim();
    const cleanCode = signupForm.verification_code.trim();
    if (!cleanEmail || !cleanCode) {
      setSignupMsg({ type: 'error', text: '이메일과 6자리 인증번호를 입력해 주세요.' });
      return;
    }

    setVerifyingCode(true);
    setSignupMsg(null);
    try {
      const res = await fetch('/api/auth/verify-email-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setEmailVerified(true);
        setSignupMsg({ type: 'success', text: data.message || '✅ 이메일 인증이 완료되었습니다!' });
      } else {
        setEmailVerified(false);
        setSignupMsg({ type: 'error', text: data.detail || data.message || '인증번호가 일치하지 않습니다.' });
      }
    } catch (err) {
      console.error(err);
      setSignupMsg({ type: 'error', text: '인증번호 확인 중 서버 통신 오류가 발생했습니다.' });
    } finally {
      setVerifyingCode(false);
    }
  };

  // 3단계: 회원가입 최종 제출
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignupMsg(null);

    const cleanId = signupForm.login_id.trim();
    const cleanPw = signupForm.requested_password.trim();
    const cleanConfirm = signupForm.confirm_password.trim();
    const cleanEmail = signupForm.email.trim();
    const cleanCode = signupForm.verification_code.trim();

    if (!cleanId || cleanId.length < 2) {
      setSignupMsg({ type: 'error', text: '사용하실 아이디(ID)를 2자 이상 입력해 주세요.' });
      return;
    }
    if (!cleanPw || cleanPw.length < 4) {
      setSignupMsg({ type: 'error', text: '비밀번호를 4자리 이상 입력해 주세요.' });
      return;
    }
    if (cleanPw !== cleanConfirm) {
      setSignupMsg({ type: 'error', text: '비밀번호와 비밀번호 확인이 일치하지 않습니다.' });
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setSignupMsg({ type: 'error', text: '이메일 주소를 입력하고 이메일 인증을 진행해 주세요.' });
      return;
    }
    if (!emailVerified && !cleanCode) {
      setSignupMsg({ type: 'error', text: '[인증번호 발송]을 눌러 이메일 인증을 완료해 주세요.' });
      return;
    }

    setSignupSubmitting(true);
    try {
      const res = await fetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login_id: cleanId,
          requested_password: cleanPw,
          email: cleanEmail,
          verification_code: cleanCode,
          name: signupForm.name.trim() || cleanId,
          phone: signupForm.phone.trim() || '-',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSignupMsg({
          type: 'success',
          text: data.message || '✅ 이메일 인증 및 회원가입이 완료되었습니다! 이제 로그인하실 수 있습니다.',
        });
        setLoginId(cleanId);
        setSignupForm({
          login_id: '',
          requested_password: '',
          confirm_password: '',
          email: '',
          verification_code: '',
          name: '',
          phone: '',
        });
        setEmailCodeSent(false);
        setEmailVerified(false);
      } else {
        setSignupMsg({ type: 'error', text: data.detail || '회원가입 처리 중 오류가 발생했습니다.' });
      }
    } catch (err) {
      console.error(err);
      setSignupMsg({ type: 'error', text: '서버와 통신할 수 없습니다.' });
    } finally {
      setSignupSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070709] text-gray-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden">
      {/* Background Decorative Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[350px] h-[350px] bg-cyan-900/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Access Card */}
      <div className="w-full max-w-[500px] bg-[#121318]/90 border border-gray-800/80 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl relative z-10 space-y-6">
        
        {/* 관리자 인증 버튼 */}
        <button
          onClick={() => setShowAdminModal(true)}
          className="absolute top-4 right-4 text-gray-600 hover:text-red-400 opacity-50 hover:opacity-100 text-xs transition-all cursor-pointer p-1 flex items-center gap-1"
          title="주인장(관리자) 감독 센터 및 관리자 비밀번호/SMTP 설정"
          tabIndex={-1}
        >
          <span>👑</span>
          <span className="text-[10px] font-bold">관리자</span>
        </button>
        
        {/* Title Header (3회 클릭 시 관리자 인증 창 오픈) */}
        <div 
          onClick={handleSecretAdminTrigger} 
          className="text-center space-y-1 cursor-pointer select-none active:opacity-80 transition-opacity"
          title="Private Access"
        >
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight font-serif hover:text-gray-100">
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
            <span>회원 로그인 및 이메일 인증 안내</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-gray-300 leading-relaxed pl-1">
            <li>일반 회원: 회원가입(이메일 인증) 시 등록한 <strong>아이디(ID)와 비밀번호</strong> 입력</li>
            <li>주인장/관리자: 아이디 <code className="text-cyan-300">admin</code>(또는 공란) + 관리자 마스터 비밀번호 입력</li>
          </ul>
        </div>

        {/* Login Input Form (ID + Password) */}
        <form onSubmit={handleLogin} className="space-y-3 pt-1">
          <div>
            <input
              type="text"
              placeholder="아이디 (ID) 입력 (관리자는 admin 또는 생략 가능)"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full bg-[#1b1c23] border border-gray-700/80 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all shadow-inner font-mono"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="비밀번호 (Password) 입력"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1b1c23] border border-gray-700/80 focus:border-cyan-500 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 outline-none transition-all shadow-inner font-mono"
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
              <span>회원가입 (이메일 인증)</span>
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

      {/* 1. 회원가입 (ID + 패스워드 + 가입자 이메일 인증) 모달 */}
      {showSignupModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121318] border border-purple-500/40 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl relative max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2.5">
              <h3 className="text-lg font-bold text-purple-300 flex items-center gap-2">
                <span>👤+</span>
                <span>회원가입 (ID · 비밀번호 · 이메일 인증)</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSignupModal(false)}
                className="text-gray-400 hover:text-white text-xs cursor-pointer"
              >
                ✕ 닫기
              </button>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              사용하실 <strong className="text-purple-300">아이디(ID)</strong>와 <strong className="text-purple-300">비밀번호</strong>를 입력하고, <strong className="text-cyan-300">본인 이메일 인증</strong>을 완료하면 즉시 가입됩니다.
            </p>

            <form onSubmit={handleSignupSubmit} className="space-y-3 pt-1">
              {/* 1) 아이디(ID) */}
              <div>
                <label className="text-[11px] text-gray-300 font-bold block mb-1">1. 아이디 (ID) *</label>
                <input
                  type="text"
                  placeholder="로그인에 사용할 아이디 (영문/숫자 2자 이상)"
                  value={signupForm.login_id}
                  onChange={(e) => setSignupForm({ ...signupForm, login_id: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                  required
                />
              </div>

              {/* 2) 비밀번호 & 비밀번호 확인 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">2. 비밀번호 *</label>
                  <input
                    type="password"
                    placeholder="4자리 이상"
                    value={signupForm.requested_password}
                    onChange={(e) => setSignupForm({ ...signupForm, requested_password: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-300 font-bold block mb-1">비밀번호 확인 *</label>
                  <input
                    type="password"
                    placeholder="비밀번호 재입력"
                    value={signupForm.confirm_password}
                    onChange={(e) => setSignupForm({ ...signupForm, confirm_password: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500 font-mono"
                    required
                  />
                </div>
              </div>

              {/* 3) 가입자 이메일 & 인증번호 발송/검증 */}
              <div className="bg-gray-900/70 border border-cyan-800/50 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-cyan-300 font-bold">3. 가입자 이메일 인증 *</label>
                  {emailVerified && (
                    <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full font-bold">
                      ✅ 이메일 인증 완료
                    </span>
                  )}
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="email"
                    placeholder="예: user@gmail.com"
                    value={signupForm.email}
                    onChange={(e) => {
                      setSignupForm({ ...signupForm, email: e.target.value });
                      setEmailVerified(false);
                    }}
                    className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
                    required
                  />
                  <button
                    type="button"
                    onClick={handleSendEmailCode}
                    disabled={sendingCode}
                    className="px-3 py-2 rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer shadow"
                  >
                    {sendingCode ? '발송 중...' : emailCodeSent ? '📨 재발송' : '📨 인증번호 발송'}
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="이메일로 받은 6자리 인증번호 입력"
                    value={signupForm.verification_code}
                    onChange={(e) => setSignupForm({ ...signupForm, verification_code: e.target.value })}
                    maxLength={6}
                    className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono tracking-widest outline-none focus:border-cyan-500"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyEmailCode}
                    disabled={verifyingCode || !signupForm.verification_code.trim()}
                    className={`px-3 py-2 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer shadow ${
                      emailVerified
                        ? 'bg-emerald-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 text-white'
                    }`}
                  >
                    {verifyingCode ? '확인 중...' : emailVerified ? '✅ 인증됨' : '✅ 인증확인'}
                  </button>
                </div>
              </div>

              {/* 4) 성함 / 연락처 (선택) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">성함 / 닉네임 (선택)</label>
                  <input
                    type="text"
                    placeholder="미입력 시 ID로 표시"
                    value={signupForm.name}
                    onChange={(e) => setSignupForm({ ...signupForm, name: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">연락처 (선택)</label>
                  <input
                    type="text"
                    placeholder="예: 010-1234-5678"
                    value={signupForm.phone}
                    onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              {signupMsg && (
                <div className={`text-xs p-2.5 rounded-lg border font-semibold leading-relaxed ${
                  signupMsg.type === 'success' 
                    ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300' 
                    : signupMsg.type === 'info'
                    ? 'bg-cyan-950/60 border-cyan-700/70 text-cyan-200'
                    : 'bg-red-950/60 border-red-700/70 text-red-300'
                }`}>
                  {signupMsg.text}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignupModal(false)}
                  className="w-1/3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer"
                >
                  닫기
                </button>
                <button
                  type="submit"
                  disabled={signupSubmitting}
                  className="w-2/3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg cursor-pointer"
                >
                  {signupSubmitting ? '가입 처리 중...' : '✅ 이메일 인증 회원가입 완료'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. 비밀번호 변경 모달 (일반회원 / 관리자 탭 지원) */}
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
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 rounded-xl text-xs transition-all cursor-pointer"
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
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold py-2 rounded-xl text-xs transition-all cursor-pointer"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 5. 관리자 승인 관리 및 관리자 비밀번호/SMTP 설정 모달 */}
      <AdminApprovalModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
      />

    </div>
  );
}
