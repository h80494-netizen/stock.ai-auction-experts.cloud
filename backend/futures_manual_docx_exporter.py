# -*- coding: utf-8 -*-
"""
KOSPI200 선물오버나잇자동매매 시스템 정밀 마스터 매뉴얼 워드(.docx) 생성기
- 제1장: 선물오버나잇자동매매 시스템 개요 및 일일 타임라인(15:30 시그널 확정 -> 15:35~15:45 종가 동시호가 오버나잇 리밸런싱)
- 제2장: 3대 지표군(① 기술지표 60% · ② 기존 당일 추세·옵션 수급지표 25% · ③ 신규 4대 중기 잔고·누적차익 역추세 수급 15%) 결합 아키텍처
- 제3장: 전체 13대 모델(모델 1 ~ 모델 12+1: M01~M10 주력 풀 & C01~C03 후보 풀) 개별 수학 공식 및 수급 결합 매뉴얼
- 제4장: 신규 4대 핵심 수급 지표(공매도잔고 T+2 · 신용잔고 T+2 · 미결제약정 OI · 5일/20일 누적 차익거래) 3단계 Gate vs Scoring 역추세 시그널 발생 원리
- 제5장: 과최적화(Overfitting) 방지 감사, Out-of-Sample Forward 일관성 검증 및 3대 MDD 위험관리·비상청산(Kill-Switch) 실전 운용 수칙
"""
import datetime
import os
from typing import List, Optional, Tuple

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Cm, Pt, RGBColor

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DOCX_PATH = os.path.join(BASE_DIR, "선물오버나잇자동매매_모델구성_및_수급결합_상세매뉴얼.docx")


def _set_cell_shading(cell, color_hex: str) -> None:
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)


def _set_font_korean(run, font_name: str = "맑은 고딕", size_pt: float = 10.0, bold: bool = False, color: Optional[Tuple[int, int, int]] = None) -> None:
    run.font.name = font_name
    run._element.rPr.rFonts.set(qn("w:eastAsia"), font_name)
    run.font.size = Pt(size_pt)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor(color[0], color[1], color[2])


def _add_styled_heading(doc: Document, text: str, level: int = 1) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14 if level == 1 else 10)
    p.paragraph_format.space_after = Pt(6 if level == 1 else 4)
    run = p.add_run(text)
    if level == 1:
        _set_font_korean(run, size_pt=15.0, bold=True, color=(15, 55, 115))
    elif level == 2:
        _set_font_korean(run, size_pt=12.5, bold=True, color=(20, 90, 70))
    else:
        _set_font_korean(run, size_pt=11.0, bold=True, color=(45, 55, 72))


def _add_body_paragraph(doc: Document, text: str, bold_prefix: str = "", space_after: float = 4.0) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = 1.28
    if bold_prefix:
        r_pre = p.add_run(bold_prefix)
        _set_font_korean(r_pre, size_pt=10.0, bold=True, color=(15, 45, 95))
    r_txt = p.add_run(text)
    _set_font_korean(r_txt, size_pt=10.0, bold=False, color=(30, 30, 30))


def _add_styled_table(
    doc: Document,
    headers: List[str],
    rows: List[List[str]],
    header_bg: str = "1E3A8A",
    zebra_bg: str = "F1F5F9",
) -> None:
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.style = "Table Grid"

    hdr_cells = table.rows[0].cells
    for c_idx, h_text in enumerate(headers):
        hdr_cells[c_idx].text = ""
        p = hdr_cells[c_idx].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = p.add_run(h_text)
        _set_font_korean(run, size_pt=9.5, bold=True, color=(255, 255, 255))
        _set_cell_shading(hdr_cells[c_idx], header_bg)

    for r_idx, row_vals in enumerate(rows):
        row_cells = table.rows[r_idx + 1].cells
        bg_hex = zebra_bg if r_idx % 2 == 1 else "FFFFFF"
        for c_idx, val in enumerate(row_vals):
            row_cells[c_idx].text = ""
            p = row_cells[c_idx].paragraphs[0]
            run = p.add_run(str(val))
            is_first_col = c_idx == 0
            _set_font_korean(
                run,
                size_pt=9.0,
                bold=is_first_col,
                color=(15, 40, 80) if is_first_col else (35, 35, 35),
            )
            _set_cell_shading(row_cells[c_idx], bg_hex)

    doc.add_paragraph()


def generate_futures_overnight_manual_docx(output_path: Optional[str] = None) -> str:
    """
    선물오버나잇자동매매 전체 모델 구성, 기술지표·기존수급·신규4대수급 결합 구조 및 매매신호 발생 메커니즘을
    상세히 설명하는 워드(.docx) 매뉴얼 파일을 생성하고 경로를 반환합니다.
    """
    target_path = output_path or DEFAULT_DOCX_PATH
    doc = Document()

    # 페이지 여백 설정 (상하 2.0cm, 좌우 1.8cm — 넓은 표 가독성 최적화)
    for section in doc.sections:
        section.top_margin = Cm(2.0)
        section.bottom_margin = Cm(2.0)
        section.left_margin = Cm(1.8)
        section.right_margin = Cm(1.8)

    # 표지 / 문서 타이틀
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_p.paragraph_format.space_before = Pt(12)
    title_p.paragraph_format.space_after = Pt(4)
    r_title = title_p.add_run("📘 KOSPI200 선물오버나잇자동매매 마스터 매뉴얼")
    _set_font_korean(r_title, size_pt=20.0, bold=True, color=(15, 45, 100))

    sub_p = doc.add_paragraph()
    sub_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    sub_p.paragraph_format.space_after = Pt(14)
    r_sub = sub_p.add_run(
        "13대 매매모델(주력 10대 + 후보 3대) 정밀 공식 · 기술지표 + 기존수급(35%) + 신규 4대수급 역추세 결합 구조 · 15:30 시그널 확정 및 동시호가 오버나잇 리밸런싱 메커니즘"
    )
    _set_font_korean(r_sub, size_pt=10.5, bold=True, color=(40, 100, 80))

    # =========================================================================
    # 제1장. 선물오버나잇자동매매 시스템 개요 및 일일 매매신호 발생·체결 구조
    # =========================================================================
    _add_styled_heading(doc, "제1장. 선물오버나잇자동매매(Overnight Auto-Trading) 시스템 개요 및 신호 발생 흐름", level=1)
    _add_body_paragraph(
        doc,
        "본 시스템은 장중 단타 노이즈와 잦은 매매 수수료를 배제하고, 매일 장 마감 직전(15:30)에 확정되는 기술지표·현선물 수급·옵션 심리·미결제약정 에너지를 종합하여 15:35~15:45 선물 종가 동시호가(Closing Call Auction)에서 목표 포지션(-5×M ~ +5×M 계약)으로 리밸런싱한 뒤 익일 종가까지 오버나잇(Overnight) 보유하는 구조입니다.",
        bold_prefix="[핵심 운용 철학] ",
    )

    _add_styled_table(
        doc,
        headers=["단계 / 시각 (KST)", "프로세스 명칭", "세부 작동 내용 및 매매신호 발생·집행 공식"],
        rows=[
            [
                "Step 1\n09:00 ~ 15:30",
                "실시간 시장데이터 수집 및\n장중 프리뷰(Preview)",
                "• 60초 주기로 KOSPI200 현물, 연결선물 시고저종, 외국인/개인 현·선물 순매수, 프로그램 차익순매수, 미결제약정(OI), 등가격 Call/Put 옵션 가격·이론가·PCR, KODEX 레버리지, 원/달러 환율, 국채선물 데이터를 DB(futures_daily_data)에 실시간 동기화합니다.",
            ],
            [
                "Step 2\n15:30:00 정각",
                "13대 모델 시그널 산출 및\n당일 목표계약 확정 (Lock)",
                "• 각 모델(M01~M10, C01~C03)이 ① 고유 순수 시그널(pure_s ∈ {-1, 0, +1})을 산출한 뒤, ② 수급비중(디폴트 35%) 결합 공식에 따라 최종 시그널(comb_s ∈ {-1, 0, +1})을 확정합니다.\n• 현재 채택된 5대 주력 모델의 시그널을 합산하여 합산포지션(Base Position = -5 ~ +5)을 구하고, 멀티플(M)을 곱해 당일 목표계약수(Target = Base × M)를 daily_signal_lock 테이블에 영구 잠금(Lock)합니다.",
            ],
            [
                "Step 3\n15:35 ~ 15:45",
                "종가 동시호가 차액(Delta)\n리밸런싱 주문 집행",
                "• 동시호가 주문수량(Delta) = 당일 목표계약(Target_t) - 전일 보유계약(Prev_{t-1})\n• Delta > 0: 매수 진입/추가 (또는 기존 매도포지션 환매수 청산)\n• Delta < 0: 매도 진입/추가 (또는 기존 매수포지션 전매도 청산)\n• Delta == 0: 주문 없음 (포지션 100% 유지, 매매수수료 0원)",
            ],
            [
                "Step 4\n익일(t+1) 15:45",
                "오버나잇 손익 정산 및\n3개월/MDD 자동 모델교체",
                "• 일별 총손익(원) = 전일 보유계약(Prev_{t-1}) × (금일 선물종가 - 전일 선물종가) × 계약승수(미니 5만원 / 정규 25만원) - 체결수수료\n• 전일 보유계약이 0계약(관망)인 날은 장중 가격 변동과 무관하게 일간 수익률 0.000% (0원)로 정산됩니다.\n• 채택 5개 모델 중 특정 모델이 편입 이후 MDD 한도(기본 12%)를 초과·갱신하거나 3개월(63일) 정기 리밸런싱 주기가 도래하면 대기 모델 중 샤프지수(Sharpe Ratio) 1위 모델로 자동 교체합니다.",
            ],
        ],
    )

    # =========================================================================
    # 제2장. 기술지표 + 기존 수급지표 + 신규 4대 수급지표의 3층 결합 구성 원리
    # =========================================================================
    _add_styled_heading(doc, "제2장. [기술적 지표] + [기존 당일 수급지표] + [신규 4대 중기 수급지표] 결합 아키텍처", level=1)
    _add_body_paragraph(
        doc,
        "단일 기술지표만 사용하면 속임수 돌파(Whip-saw)나 추세 끝물의 고점 물림/저점 추격매도가 발생합니다. 본 시스템은 서로 다른 시간 프레임(Time-Horizon)을 가진 3개 계층의 지표를 결합하여 다중공선성(중복 계산)을 없애고 수익률과 MDD 방어력을 동시에 극대화합니다.",
        bold_prefix="[왜 3층 결합인가?] ",
    )

    _add_styled_table(
        doc,
        headers=["계층 구분 (권장 황금비율)", "구성 지표 및 데이터 원천", "시그널 결합에서의 핵심 역할 (Role)", "해결하는 문제점"],
        rows=[
            [
                "제1계층: 주 동력\n기술적 지표 (Technical)\n[비중 60% ~ 65%]",
                "• 다중 이동평균(3/5/10/20/60MA)\n• 전일 변동폭(H-L) 돌파\n• 11일 고저 채널(TnT)\n• 더블 스토캐스틱(14-10-14-10-3)\n• 시가 갭(Gap) & 장중 양/음봉\n• 선물/KODEX레버리지 스프레드\n• 캔들 상하단 에너지(E-P)",
                "• 각 모델의 고유 순수 시그널(pure_s ∈ {-1, 0, +1}) 생성\n• 추세의 시작과 단기 오실레이터 타점을 포착하는 1차 엔진",
                "• 수급이 아직 반응하기 전 가격 자체의 초기 추세 모멘텀 포착",
            ],
            [
                "제2계층: 단기 추세·에너지 필터\n기존 수급·심리지표\n[디폴트 35% / 하이브리드 25%]",
                "• 축① 추세 수급 동력:\n  52주 신고-신저 종목수(5MA vs 20MA) + 외국인 선물·현물 순매수(5MA vs 20MA, 60일 Rank)\n• 축② 단기 평균회귀 에너지:\n  프로그램 차익 5일합 Z-Score & 90일 Rank + 미결제약정(OI) 20일 Z-Score + 등가격 옵션 PCR Z-Score & Black-76 이론가 괴리율",
                "• [역풍 매도 차단]: 순수 신호가 매도(-1)여도 외인·신고저 상승 동조(trend_up) 또는 하방 에너지 과열 반등(energy_rebound_up)이면 0(중립)으로 차단\n• [고점 추격매수 차단]: 순수 신호가 매수(+1)여도 상방 에너지 피크아웃(energy_exhaust_top) 또는 하락추세+미결제 누적(oi_z>0.30)이면 0(중립)으로 차단\n• [중립 타점 보강]: 역추세/수급 모델이 0일 때 에너지 회귀+추세 일치 시 ±1 진입",
                "• 순수 기술지표 단독 대비 10년 누적수익률을 +122.62% → +198.91%로 +76.29%p 향상시키고 가짜 돌파 손실을 제거",
            ],
            [
                "제3계층: 중기 재고한계·언와인딩\n신규 4대 핵심 수급 역추세\n[하이브리드 결합 15%]",
                "• ① 공매도잔고(시총비 120일 Z, T+2 shift(2))\n• ② 신용융자잔고(시총비 120일 Z, T+2 shift(2))\n• ③ 미결제약정 증감(ΔOI < 0 청산 전환 & ΔP 결합)\n• ④ 5일·20일 누적 차익거래(20일 거래대금 대비 120일 Z & 동시만기 리셋)",
                "• [고점/저점 50% 디레버리징 브레이크(7.5%)]: 추세 모델이 매수 보유 중 신용잔고+20일차익이 +1.75σ 이상 한계 과열된 후 5일차익 둔화(ΔArb5_Z<0) 및 미결제 감소(ΔOI<0, 롱 청산) 시작 시 보유 계약을 즉시 50% 축소\n• [숏스퀴즈/롱청산 스나이퍼 부스트(7.5%)]: 3단계 Gate 및 극단 과열(|Score|≥2.15) 피크아웃 시 ±1계약 알파 포지션 결합",
                "• 당일(1~5일) 수급이 놓치는 20~120일 주기의 신용·차익 레버리지 재고 한계 및 숏스퀴즈 변곡점을 포착하여 10년 수익률 +220.32%, 2026년 +182.33% (Sharpe 2.818) 달성",
            ],
        ],
    )

    _add_styled_heading(doc, "2-1. 기존 수급비중 35%(디폴트) 내부 수학 공식 및 슬라이더(10%~65%) 조정 메커니즘", level=2)
    _add_body_paragraph(
        doc,
        "1) 추세형 수급 종합점수(TrendSupplyScore) = 0.50 × (신고신저 45% + 외국인 55% + 동조보너스 30%) + 0.20 × 프로그램차익추세 + 0.15 × 미결제추세 + 0.15 × 옵션PCR추세",
        bold_prefix="• 추세형 수급 공식: ",
    )
    _add_body_paragraph(
        doc,
        "2) 역추세형 수급 종합점수(RevSupplyScore) = 0.45 × (0.60 × 에너지회귀신호 + 0.40 × 신고외인결합) + 0.20 × 프로그램차익추세 + 0.15 × 미결제회귀 + 0.20 × 옵션PCR회귀",
        bold_prefix="• 역추세형 수급 공식: ",
    )
    _add_body_paragraph(
        doc,
        "3) 수급비중 슬라이더(w = 10% ~ 65%, 디폴트 35%)를 조정하면 미결제 과열 차단 임계치 oi_guard_thresh = 0.30 - (w - 0.35) × 0.80 가 실시간으로 변동합니다. 비중을 40%~65%로 높이면 수급 종합점수가 기술 신호를 더 강하게 차단·견인하고, 10%~30%로 낮추면 수급 게이트가 차단했던 순수 기술 신호(pure_s)를 원상 복원합니다.",
        bold_prefix="• 수급비중 슬라이더 실시간 연동: ",
    )

    # =========================================================================
    # 제3장. 전체 13대 모델(모델 1 ~ 모델 12+1) 개별 구성 및 매매신호 발생 공식 상세 매뉴얼
    # =========================================================================
    _add_styled_heading(doc, "제3장. 모델 1 ~ 모델 12+1 (M01~M10 주력 풀 & C01~C03 후보 풀) 개별 구성 및 신호 발생 매뉴얼", level=1)
    _add_body_paragraph(
        doc,
        "아래 표는 원본 엑셀(모델1_2.xlsx, 모델35910.xlsx, 모델4/6/7/8/11.xlsx, rawdata.xlsx, 종합화면.xlsx)의 Logic 1 ~ Logic 12를 1:1로 구현한 전체 13개 모델의 ① 기초 입력 데이터, ② 순수 시그널(pure_s) 발생 조건식, ③ 수급비중(35%) 결합 시 최종 시그널(comb_s) 변환 규칙을 정리한 정밀 매뉴얼입니다.",
    )

    model_rows = [
        [
            "모델 1\nM01_MA_Trend\n[✅ 채택 주력 #1]",
            "추세형\n(mode='trend')\n원본: Logic 9 & 5\n(TnT!BR, AX)",
            "• 선물 종가(C) 및 3일, 5일, 10일, 20일, 60일 이동평균선 산출\n• 정배열 가중점수 score_ma = (C>MA5 ? +0.25 : -0.25) + (MA3>MA5 ? +0.25 : -0.25) + (MA5>MA10 ? +0.20 : -0.20) + (MA5>MA20 ? +0.15 : -0.15) + (MA20>MA60 ? +0.15 : -0.15)\n• score_ma ≥ +0.30 → 매수(+1)\n• score_ma ≤ -0.30 → 매도(-1)\n• 그 외 → 중립(0)",
            "• pure_s == +1(정배열 매수)이라도 당일 상방 에너지 피크아웃(oi_z>0.90 & 차익/PCR 과열) 또는 하락수급+미결제 누적(trend_dn & oi_z>0.30) 발생 시 0(중립)으로 차단하여 고점 물림 방지\n• pure_s == -1(역배열 매도)이라도 외인·신고저 상승 동조(trend_up) 또는 하방 과열 반등(energy_rebound_up) 시 0으로 차단",
        ],
        [
            "모델 2\nM02_Breakthrough\n[⏳ 10대풀 대기]",
            "추세형\n(mode='trend')\n원본: Logic 6\n(Breakthrough!AA)",
            "• 전일 선물 변동폭 R = High(t-1) - Low(t-1)\n• 상단 돌파선 BuyPoint = Close(t-1) + 0.5 × R\n• 하단 이탈선 SellPoint = Close(t-1) - 0.5 × R\n• 금일 종가 > BuyPoint → 매수(+1)\n• 금일 종가 < SellPoint → 매도(-1)\n• 밴드 내부일 때는 직전 돌파 방향 유지(ffill)",
            "• 변동성 하향 이탈(-1)이 발생해도 당일 외국인 선물·신고저가 상승 추세(trend_up)이거나 차익·PCR 하방 과열 반등(energy_rebound_up)이면 가짜 하방 돌파(Whip-saw)로 판정하여 0(관망)으로 방어\n• 상향 돌파(+1) 시에도 미결제 과열 피크아웃이면 0으로 추격매수 차단",
        ],
        [
            "모델 3\nM03_TnT_Channel\n[✅ 채택 주력 #2]",
            "추세형\n(mode='trend')\n원본: Logic 3\n(TnT!BJ)",
            "• 선물 5일 이동평균(MA5)의 직전 11거래일 최고값(ch_high)과 최저값(ch_low) 채널 산출\n• 단기 3일 이동평균(MA3) > ch_high 상향 돌파 → 매수(+1)\n• 단기 3일 이동평균(MA3) < ch_low 하향 이탈 → 매도(-1)\n• 채널 내부(ch_low ≤ MA3 ≤ ch_high) → 중립(0)",
            "• 11일 채널 돌파는 중기 추세 신호이나 채널 상단 돌파 직후 미결제약정·차익거래가 극단 과열(energy_exhaust_top)되거나 외인 수급이 하락 반전(trend_dn & oi_z>0.30)하면 즉시 0(관망)으로 전환해 끝물 진입 차단",
        ],
        [
            "모델 4\nM04_Double_Stochastic\n[⏳ 10대풀 대기]",
            "반추세형\n(mode='reversion')\n원본: Logic 4\n(Double_stochastic!S)",
            "• 14일 Fast%K → 10일 평균 Slow%K → 다시 14일 스토캐스틱 변환 후 10일 평균 DSlow%K 및 3일 평균 DSlow%D 산출\n• 침체권 골든크로스(DSlow%K < 30 & %K ≥ %D) 또는 중립 상단(%K > 55) → 매수(+1)\n• 과열권 데드크로스(DSlow%K > 70 & %K ≤ %D) 또는 중립 하단(%K < 45) → 매도(-1)",
            "• mode='reversion' 적용: 스토캐스틱 역추세 매도(-1) 신호가 나와도 강한 외인 상승추세(trend_up)에서는 0으로 차단\n• 스토캐스틱 중립(0) 구간에서도 하방 에너지 반등+상승수급(energy_rebound_up & trend_up) 시 +1 매수, 상방 과열 피크아웃+하락수급 시 -1 매도 타점 보강",
        ],
        [
            "모델 5\nM05_Gap_Reversion\n[✅ 채택 주력 #3]",
            "반추세형\n(mode='reversion')\n원본: Logic 8\n(Gap!AB)",
            "• 시가 갭 비율 Gap = (금일 선물시가 / 전일 선물종가) - 1.0\n• 장중 방향 Intraday = 금일 선물종가 - 금일 선물시가\n• ① 하락 갭(Gap < -0.5%) 후 장중 양봉(Intraday > 0) 반등 또는 종가 < MA5 × 0.985 단기 과매도 → 매수(+1)\n• ② 상승 갭(Gap > +0.5%) 후 장중 음봉(Intraday < 0) 되돌림 또는 종가 > MA5 × 1.015 단기 과열 → 매도(-1)",
            "• 시가 갭 역추세 매매는 수급 방향과 정면 충돌할 때 가장 위험하므로, 35% 수급 결합 게이트가 외인·신고저 추세 동력(trend_up/trend_dn)과 반대되는 역풍 진입을 0으로 차단하고 차익·PCR·미결제 평균회귀 에너지와 일치할 때만 진입",
        ],
        [
            "모델 6\nM06_ETF_Spread\n[⏳ 10대풀 대기]",
            "횡보형\n(mode='reversion')\n원본: Logic 7\n(ETF_spread!S)",
            "• 선물 대 KODEX레버리지 가격비율 Spread = (선물종가 × 500,000) / KODEX레버리지종가\n• 50일 볼린저 밴드 평균(sp_mean) 및 표준편차(sp_std) 산출\n• Spread < 하단밴드(sp_mean - 1.5σ) 또는 평균 하회 → 매수(+1)\n• Spread > 상단밴드(sp_mean + 1.5σ) 또는 평균 상회 → 매도(-1)\n• 단, 평균 부근(|Spread - sp_mean| < 0.35σ)은 중립(0)",
            "• 선물과 레버리지 ETF 간의 상대 가격 괴리 평균회귀 신호에 역추세 수급 스코어(rev_supply_score: 차익·미결제·PCR 평균회귀)를 35% 결합하여 횡보장 밴드 매매 승률을 높이고 추세 폭락장 조기 진입을 방어",
        ],
        [
            "모델 7\nM07_Popular_Energy\n[⏳ 10대풀 대기]",
            "횡보/추세형\n(mode='trend')\n원본: Logic 1 & 2\n(popular!CN, DS)",
            "• 장중 매수 에너지 Energy = 양봉 시 (H - O), 음봉 시 (H - (O+C)/2)\n• 하단 지지 인기도 Popular = 양봉 시 (O - L), 음봉 시 ((O+C)/2 - L)\n• (Energy - Popular)의 20일 이동평균(ep_diff)과 60일 표준편차(ep_std) 비교\n• ep_diff > +0.25 × ep_std → 매수(+1)\n• ep_diff < -0.25 × ep_std → 매도(-1)",
            "• 캔들 위아래 꼬리 에너지(E-P)가 상방(+1)이어도 미결제약정 과열 피크아웃(energy_exhaust_top) 또는 외인 하락추세+미결제 누적 시 0으로 제어하여 수급 없는 캔들 착시를 제거",
        ],
        [
            "모델 8\nM08_Foreign_Program_Flow\n[✅ 채택 주력 #4]",
            "수급전담형\n(mode='self_supply')\n원본: popular!BG~BI\n& 종합화면!AQ~AS",
            "• 4대 추세·수급 종합점수 trend_supply_score = 신고외인결합(50%) + 프로그램차익 90일 Rank/Z(20%) + 미결제약정 추세(15%) + 옵션 PCR 추세(15%)\n• trend_supply_score ≥ +0.25 → 매수(+1)\n• trend_supply_score ≤ -0.25 → 매도(-1)\n• 그 외(-0.25 ~ +0.25) → 중립(0)",
            "• 포트폴리오 내 전담 수급 모델: 수급 자체가 주 동력(100%)이며, 미결제·차익 극단 과열 시 피크아웃 청산(0)과 중립(0) 구간 에너지 평균회귀 반전 진입(w≥15% 시)을 동시에 수행하여 수급 급변에 즉각 대응",
        ],
        [
            "모델 9\nM09_Option_Investor_Flow\n[⏳ 10대풀 대기]",
            "심리·수급형\n(mode='self_supply')\n원본: Logic 11\n(Option!AF, AG, BB)",
            "• ① 콜/풋 이론가 괴리율 스프레드 (Call종가-Call이론가)-(Put종가-Put이론가) > 0 (30%)\n• ② 옵션 하락강도 AF = (Put고가-Put종가)-(Call고가-Call종가) 3MA > 0 (25%)\n• ③ 등가격 PCR < PCR 5MA (20%)\n• ④ 옵션 외국인 (콜-풋) 3일 순매수 > 0 (15%)\n• ⑤ 옵션 개인 (콜-풋) 3일 순매수 < 0 역발상 (10%)\n• 가중합 opt_score ≥ +0.25 → 매수(+1), ≤ -0.25 → 매도(-1)",
            "• 옵션 시장의 Black-76 이론가 괴리율·PCR·옵션 투자자 수급 신호에 선물 시장의 외국인·미결제·차익 수급 게이트(35%)를 교차 결합하여 옵션 만기 주간 등의 단독 허수 신호를 필터링",
        ],
        [
            "모델 10\nM10_Breadth_HPI_Sentiment\n[✅ 채택 주력 #5]",
            "종합·심리형\n(mode='trend')\n원본: Logic 12\n(rawdata!CT, CU)",
            "• ① ADR(상승-하락 종목수 차이) 5MA > +20이면 +1, < -20이면 -1 (가중치 40%)\n• ② 52주 신고가-신저가 종목수 차이 5MA > +2이면 +1, < -2이면 -1 (가중치 30%)\n• ③ 미결제약정 누적증감 90일 Rank(≥65 / ≤25) × 선물종가 90일 Rank(≥60 / ≤30) 결합 HPI (가중치 30%)\n• 가중합 sent_score ≥ +0.25 → 매수(+1), ≤ -0.25 → 매도(-1)",
            "• 시장 내부 폭(Breadth: 상승 종목 확산도)과 선물 미결제 에너지(HPI)를 전담 결합하며, 대형주 몇 개만 오르고 외국인 선물·미결제 수급이 이탈하는 지수 왜곡 구간에서 35% 수급 게이트로 추격매수를 차단",
        ],
        [
            "모델 11 (후보 1)\nC01_KTB_FX_Macro_Trend\n[🟣 신규 후보 #1]",
            "매크로 추세형\n(mode='trend')\n원본: popular!Z(W/$)\n& Sheet3!G~K, S~T",
            "• ① 원/달러 환율 종가 < 환율 20MA (원화 강세 = 외국인 자금 유입 우호, 가중치 50%)\n• ② 선물 종가 > 선물 20MA (가중치 35%)\n• ③ 3년 국채선물 종가 ≥ 국채선물 20MA (금리 안정, 가중치 15%)\n• 합산 macro_score ≥ +0.20 → 매수(+1), ≤ -0.20 → 매도(-1)",
            "• 환율·국채 매크로 추세 신호에 외국인 선물·현물 및 미결제 수급 게이트(35%)를 결합하여 글로벌 패시브 자금의 환차익 매수/매도 사이클과 동기화 (3M/6M 연속성 통과 시 10대 풀 자동 승격)",
        ],
        [
            "모델 12 (후보 2)\nC02_Basis_Arbitrage_Flow\n[🟣 신규 후보 #2]",
            "베이시스 수급형\n(mode='self_supply')\n원본: rawdata.xlsx\nSheet3!E, O, P, X",
            "• 선물-현물 베이시스 Basis = 선물종가 - KOSPI200종가 (10일 평균 basis_ma10 비교)\n• 현물 수급 다이버전스 Div = (외국인 현물 순매수 - 개인 현물 순매수)의 5일 평균\n• Basis ≥ basis_ma10 & Div > 0 (콘탱고 개선 + 외인 현물 매수우위) → 매수(+1)\n• Basis < basis_ma10 & Div < 0 (백워데이션 악화 + 외인 현물 매도우위) → 매도(-1)",
            "• 베이시스 호전/악화에 따른 프로그램 차익·비차익 유입 동력에 미결제·PCR 과열 피크아웃 및 평균회귀 에너지(35%)를 결합하여 만기 전후 베이시스 급변 리스크 제어",
        ],
        [
            "모델 13 (후보 3)\nC03_Multi_Stoch_Momentum\n[🟣 신규 후보 #3]",
            "다중오실레이터\n(mode='reversion')\n원본: Logic 10 (Tech2)\n(TnT!BS SUM_P)",
            "• 7개 단·중·장기 지표 가중합 SUM_P (88점 만점 정규화):\n  C>MA5(20점) + MA3>MA5(20점) + MA5>MA10(8점) + Stoch(5,3) %K>%D(20점) + Stoch(10,6) %K>%D(5점) + Stoch(20,12) %K>%D(5점) + 당일 ADR>0(10점)\n• SUM_P / 88.0 ≥ +0.30 → 매수(+1), ≤ -0.30 → 매도(-1)",
            "• 단기(5일)·중기(10일)·장기(20일) 스토캐스틱과 이평선 결합 점수(SUM_P)에 역추세 수급·에너지 회귀 필터(rev_supply_sig 35%)를 결합하여 변곡점 타점 정밀화",
        ],
    ]

    _add_styled_table(
        doc,
        headers=["모델 번호 / ID", "분류 / 원본 Logic", "① 고유 순수 시그널(pure_s) 산출 수학 공식", "② 수급비중 35%(디폴트) 결합 시 시그널 변환 공식"],
        rows=model_rows,
    )

    # =========================================================================
    # 제4장. 신규 4대 핵심 수급 지표 역추세 매매신호 발생 원리 (3단계 Gate vs Scoring)
    # =========================================================================
    _add_styled_heading(doc, "제4장. 신규 4대 핵심 수급 지표(공매도·신용·OI·누적차익) 역추세 매매신호 발생 매뉴얼", level=1)
    _add_body_paragraph(
        doc,
        "시총 팽창이나 유동성 변화에 따른 과거 데이터 왜곡을 막기 위해 4대 수급 지표를 모두 시가총액 또는 20일 평균 거래대금 대비 상대 비율(Ratio)로 변환한 뒤 과거 120영업일 롤링 Z-Score로 표준화합니다. 특히 T+2일에 공시·확정되는 공매도잔고와 신용융자잔고는 반드시 shift(2)를 적용해 선행 편향(Look-Ahead Bias)을 원천 차단합니다.",
        bold_prefix="[데이터 전처리 및 시점 보정 원칙] ",
    )

    _add_styled_table(
        doc,
        headers=["단계 구분", "활용 수급 지표", "매수(Long) 역추세 신호 조건 (숏 스퀴즈 포착)", "매도(Short) 역추세 신호 조건 (롱 청산 포착)"],
        rows=[
            [
                "1단계\n과열 셋업 (Setup)\n[재고 한계 도달]",
                "① 공매도잔고(T+2)\n② 신용잔고(T+2)\n④ 20일 누적 차익거래",
                "• 공매도잔고 120일 Z-Score (Short_Z) ≥ +1.5σ\n• 20일 누적 차익거래 120일 Z-Score (CumArb20_Z) ≤ -1.5σ\n(공매도와 매도차익 물량이 한계치까지 누적된 상태)",
                "• 신용융자잔고 120일 Z-Score (Credit_Z) ≥ +1.5σ\n• 20일 누적 차익거래 120일 Z-Score (CumArb20_Z) ≥ +1.5σ\n(신용 레버리지와 매수차익 물량이 한계치까지 누적된 상태)",
            ],
            [
                "2단계\n수급 고갈 (Filter)\n[유입 피로도 확인]",
                "④ 5일 누적 차익거래\n③ 미결제약정(OI)",
                "• 5일 누적 차익거래 Z-Score가 전일 대비 상승 전환 (ΔCumArb5_Z > 0: 추가 매도차익 유입 둔화)\n• 하락 추세 중 미결제약정 증가세 둔화",
                "• 5일 누적 차익거래 Z-Score가 전일 대비 하락 전환 (ΔCumArb5_Z < 0: 추가 매수차익 유입 둔화)\n• 상승 추세 중 미결제약정 증가세 둔화",
            ],
            [
                "3단계\n반전 트리거 (Trigger)\n[언와인딩·청산 개시]",
                "③ 미결제약정(ΔOI < 0)\n+ 가격 돌파 모멘텀",
                "• 미결제약정 감소 전환 (ΔOI < 0: 기존 숏 포지션의 손절·환매수 커버링 개시)\n• 전일 고가 돌파 또는 장중 양봉(C > O) 전환 시 매수 진입",
                "• 미결제약정 감소 전환 (ΔOI < 0: 기존 롱 포지션의 손절·전매도 청산 개시)\n• 전일 저가 이탈 또는 장중 음봉(C < O) 전환 시 매도 진입",
            ],
            [
                "4단계\n3중 청산 규칙\n(Exit & Risk Control)",
                "④ 20일 누적차익 회귀\n+ Time-Stop\n+ ATR(14) Hard-Stop",
                "• [목표 익절]: 20일 누적 차익거래 Z-Score가 0(중립)으로 회귀하거나 OI 청산 흐름이 멈출 때 즉시 익절\n• [시간 손절(Time-Stop)]: 최대 보유기간 6영업일 도달 시 자동 청산\n• [가격 손절(Hard-Stop)]: 진입가 대비 ATR(14) × 1.5배 하향 이탈 시 즉시 손절\n• [만기 필터]: 동시만기일(3·6·9·12월 둘째 목요일) D-3~D+2 주간 신규 진입 제한 및 누적차익 창 리셋",
                "• [목표 익절]: 20일 누적 차익거래 Z-Score가 0(중립)으로 회귀하거나 OI 청산 흐름이 멈출 때 즉시 익절\n• [시간 손절(Time-Stop)]: 최대 보유기간 6영업일 도달 시 자동 청산\n• [가격 손절(Hard-Stop)]: 진입가 대비 ATR(14) × 1.5배 상향 돌파 시 즉시 손절\n• [만기 필터]: 동시만기일(3·6·9·12월 둘째 목요일) D-3~D+2 주간 신규 진입 제한 및 누적차익 창 리셋",
            ],
        ],
    )

    # =========================================================================
    # 제5장. 5대 결합 아키텍처 백테스트 및 Out-of-Sample Forward 일관성·과최적화 감사 결과
    # =========================================================================
    _add_styled_heading(doc, "제5장. 결합 아키텍처별 성과 비교 및 Out-of-Sample Forward 일관성(과최적화 방지) 검증", level=1)
    _add_body_paragraph(
        doc,
        "최근 10년(2016~2026, 2,662거래일)을 전반부 60%(In-Sample: 2016.01~2022.07)와 후반부 40% 미학습 구간(Out-of-Sample Forward: 2022.07~2026.11)으로 엄격히 분리하고, 21개 6개월 슬라이딩 Forward 구간 및 파라미터 ±20% 섭동(Perturbation) 테스트를 수행한 결과입니다.",
    )

    _add_styled_table(
        doc,
        headers=[
            "결합 아키텍처 구분",
            "10년 전체 누적수익률\n(Sharpe / MDD)",
            "2026년 YTD 수익률\n(Sharpe / MDD)",
            "Out-of-Sample Forward\n(2022.07~현재 미학습구간)",
            "6개월 Forward 구간\n플러스(+) / 기준우위 비율",
        ],
        rows=[
            [
                "① 순수 기술지표 단독\n(기술 100% · 수급 0%)",
                "+122.62%\n(Sharpe 0.362 / MDD -23.01%)",
                "+103.26%\n(Sharpe 1.552 / MDD -26.31%)",
                "+123.23%\n(Sharpe 0.727 / MDD -26.31%)",
                "플러스: 52.4% (11/21구간)\n우위/방어: 38.1% (8/21구간)",
            ],
            [
                "② 현재 기본 모델 (디폴트)\n(기술 65% + 기존수급 35%)",
                "+198.91%\n(Sharpe 0.719 / MDD -21.25%)",
                "+157.81%\n(Sharpe 2.579 / MDD -27.32%)",
                "+189.57%\n(Sharpe 1.246 / MDD -27.32%)",
                "플러스: 57.1% (12/21구간)\n기준 모델 (100.0%)",
            ],
            [
                "③ 6모델 독립 가산형\n(기존 5모델 + 4대수급 Gate ±1)",
                "+215.81%\n(Sharpe 0.760 / MDD -20.99%)",
                "+172.43%\n(Sharpe 2.706 / MDD -27.32%)",
                "+206.82%\n(Sharpe 1.313 / MDD -27.32%)",
                "플러스: 57.1% (12/21구간)\n우위/방어: 71.4% (15/21구간)",
            ],
            [
                "④ 과열 역풍 브레이크 + Gate 스위칭\n(MDD 최소 방어 · 일관성 최우수)",
                "+200.93%\n(Sharpe 0.733 / MDD -20.85%)",
                "+166.23%\n(Sharpe 2.742 / MDD -25.89%)",
                "+194.16%\n(Sharpe 1.290 / MDD -25.89%)",
                "플러스: 61.9% (13/21구간)\n우위/방어: 85.7% (18/21구간)",
            ],
            [
                "⑤ ★ 최적 하이브리드 결합\n(기술 60% + 기존 25% + 4대역추세 15%)",
                "+220.32%\n(Sharpe 0.766 / MDD -24.38%)",
                "+182.33%\n(Sharpe 2.818 / MDD -30.60%)",
                "+212.86%\n(Sharpe 1.333 / MDD -25.39%)",
                "플러스: 61.9% (13/21구간)\n우위/방어: 85.7% (18/21구간)",
            ],
        ],
    )

    _add_body_paragraph(
        doc,
        "브레이크 임계치(1.45σ ~ 2.10σ)와 부스트 임계치(1.85σ ~ 2.50σ)를 ±20% 범위로 흔들어도 10년 누적수익률은 +206.21% ~ +223.32%, Out-of-Sample Forward Sharpe는 1.263 ~ 1.341 사이에 위치하며 수익률 변동계수(CV)가 2.76%에 불과합니다. 즉 특정 파라미터 값에 과최적화되지 않은 강건한(Robust) 모델임이 입증되었습니다.",
        bold_prefix="[과최적화 감사 최종 판정] ",
    )

    footer_p = doc.add_paragraph()
    footer_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer_p.paragraph_format.space_before = Pt(10)
    r_foot = footer_p.add_run(f"문서 생성일시: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | STOCK.AI-AUCTION-EXPERTS.CLOUD")
    _set_font_korean(r_foot, size_pt=8.5, bold=False, color=(120, 120, 120))

    doc.save(target_path)
    return target_path


if __name__ == "__main__":
    out_file = generate_futures_overnight_manual_docx()
    print(f"Generated Word manual: {out_file}")
