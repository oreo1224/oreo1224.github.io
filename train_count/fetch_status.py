import json
import os
from datetime import datetime

import requests
from bs4 import BeautifulSoup

# --- 設定ファイルと運行状況ファイルの相対パス（train_count/ から見たパス） ---
CONFIG_FILE = "data/config.json"
STATUS_FILE = "data/train_status.json"
ALERT_KEYWORDS = ["遅延", "運転見合わせ", "運休", "一部列車"]


# --- 運行状況の取得 ---
def get_operation_status(target_url):
    """Yahoo!乗換案内の運行情報ページをスクレイピングし、運行状況を取得する。"""
    try:
        response = requests.get(target_url, timeout=10)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Yahoo!運行情報ページの特定の要素から運行状況テキストを取得
        status_element = soup.find("p", class_="subText_01")
        status_text = status_element.text.strip() if status_element else "情報なし"

        is_normal = True
        alert_message = ""

        # 平常運転でないかキーワードでチェック
        if "平常運転" not in status_text:
            for keyword in ALERT_KEYWORDS:
                if keyword in status_text:
                    is_normal = False
                    alert_message = status_text
                    break

        # 最終的に「平常運転」以外のテキストが残っていたらそれを採用
        if is_normal and "平常運転" not in status_text and status_text != "情報なし":
            is_normal = False
            alert_message = status_text
        elif is_normal:
            alert_message = ""

        return {"is_normal": is_normal, "message": alert_message}

    except Exception as e:
        print(f"運行状況の取得中にエラーが発生しました: {e}")
        return {
            "is_normal": False,
            "message": "スクレイピングエラー: 最新の運行情報を取得できませんでした。",
        }


# --- JSONファイルの更新 ---
def update_status_file(status):
    """取得した運行状況を train_status.json に書き込む。"""
    current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        data = {"timestamp": current_time, "status": status}

        # JSONファイルを上書き保存
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        print(f"更新完了。平常運転: {status['is_normal']}")

    except Exception as e:
        print(f"ファイル {STATUS_FILE} の更新中にエラーが発生しました: {e}")


if __name__ == "__main__":
    print(
        f"--- 運行状況チェック開始 ({datetime.now().strftime('%Y-%m-%d %H:%M:%S')}) ---"
    )

    # config.jsonからURLを読み込む
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
        target_url = config["station_info"]["fetch_url"]
        print(f"対象URL: {target_url}")
    except Exception as e:
        print(
            f"設定ファイル {CONFIG_FILE} の読み込みに失敗しました。パスを確認してください: {e}"
        )
        exit(1)

    # 運行状況を取得し、ファイルに書き込む
    status = get_operation_status(target_url)
    update_status_file(status)

    print("--- 運行状況チェック完了 ---")
