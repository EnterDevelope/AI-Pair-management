import { describe, it, expect } from "vitest"
import { detectLang } from "../lang-detect.js"

describe("detectLang", () => {
  it("한국어 텍스트를 'ko'로 감지한다", () => {
    expect(detectLang("헬스장 예약 앱")).toBe("ko")
  })

  it("영어 텍스트를 'en'으로 감지한다", () => {
    expect(detectLang("gym booking app")).toBe("en")
  })

  it("일본어(가나) 텍스트를 'ja'로 감지한다", () => {
    expect(detectLang("ジム予約アプリ")).toBe("ja")
  })

  it("중국어(한자) 텍스트를 'zh'로 감지한다", () => {
    expect(detectLang("健身房预约")).toBe("zh")
  })

  it("빈 문자열은 'en'으로 반환한다 (기본값)", () => {
    expect(detectLang("")).toBe("en")
  })

  it("숫자/특수문자만 있으면 'en'으로 반환한다 (기본값)", () => {
    expect(detectLang("123 !@#")).toBe("en")
  })

  it("한글+영문 혼합 텍스트에서 한글 우선 감지한다 (D-13)", () => {
    expect(detectLang("헬스장 booking app")).toBe("ko")
  })

  it("히라가나 텍스트를 'ja'로 감지한다", () => {
    expect(detectLang("ぎむよやくあぷり")).toBe("ja")
  })
})
