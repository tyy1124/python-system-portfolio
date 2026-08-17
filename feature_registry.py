# -*- coding: utf-8 -*-
"""
網站功能清單

新增功能時，只要在 FEATURES 增加一筆，
首頁統計、快捷入口與全站搜尋就會一起更新。
"""

FEATURES = [
    {
        "id": "personal_information",
        "title": "個人資料",
        "category": "個人功能",
        "description": "查看目前登入帳號、姓名與 Email。",
        "endpoint": "personal_information",
        "keywords": ["會員", "帳號", "姓名", "email", "個人資料"],
        "featured": True
    },
    {
        "id": "about_me",
        "title": "關於我",
        "category": "關於本站",
        "description": "了解 TYY 小站的學習歷程、開發方向與作品理念。",
        "endpoint": "about_me",
        "keywords": ["關於我", "TYY", "自我介紹", "學習歷程", "作品理念"]
    },
    {
        "id": "technology_overview",
        "title": "使用技術",
        "category": "關於本站",
        "description": "整理網站實際使用的 Flask、資料庫、部署、API、機器學習與前端技術。",
        "endpoint": "technology_overview",
        "keywords": ["技術", "Flask", "SQLAlchemy", "Heroku", "JavaScript", "PyTorch", "TDX"]
    },
    {
        "id": "developer_toolkit",
        "title": "TYY 開發工具箱",
        "category": "關於本站",
        "description": "搜尋並查看 Flask、資料庫、Heroku、API、機器學習與 PyTorch 的完整筆記及範本。",
        "endpoint": "portfolio_bp.developer_toolkit",
        "keywords": ["工具箱", "範本", "筆記", "Flask", "Heroku", "SQLAlchemy", "PyTorch"]
    },
    {
        "id": "site_updates",
        "title": "網站更新紀錄",
        "category": "網站功能",
        "description": "依日期查看 TYY 小站每日新增功能、修正項目與版本紀錄。",
        "endpoint": "update_history",
        "keywords": ["更新", "公告", "版本", "歷史", "changelog"]
    },
    {
        "id": "bmi",
        "title": "BMI 計算",
        "category": "課堂作業",
        "description": "輸入身高與體重，計算 BMI。",
        "endpoint": "schoolassignment.bmi",
        "keywords": ["BMI", "身高", "體重", "健康"]
    },
    {
        "id": "compare_numbers",
        "title": "三個數字比大小",
        "category": "課堂作業",
        "description": "比較三個數字的最大值與最小值。",
        "endpoint": "schoolassignment.Comparing_the_sizes_of_three_numbers",
        "keywords": ["數字", "最大值", "最小值", "比較"]
    },
    {
        "id": "digital_generator",
        "title": "數字產生器",
        "category": "課堂作業",
        "description": "依照範圍與數量產生隨機數字。",
        "endpoint": "schoolassignment.digital_generator",
        "keywords": ["隨機", "數字", "產生器", "random"]
    },
    {
        "id": "fibonacci",
        "title": "費式數列",
        "category": "課堂作業",
        "description": "依照指定數量產生 Fibonacci 數列。",
        "endpoint": "schoolassignment.fibonacci",
        "keywords": ["費式", "費波那契", "Fibonacci", "數列"]
    },
    {
        "id": "tristar",
        "title": "TriStar",
        "category": "課堂作業",
        "description": "依照層數輸出星號三角形。",
        "endpoint": "schoolassignment.tristar",
        "keywords": ["星號", "三角形", "迴圈", "TriStar"]
    },
    {
        "id": "baseconversion",
        "title": "進制轉換",
        "category": "課堂作業",
        "description": "將十進位數字轉換成八進位。",
        "endpoint": "schoolassignment.baseconversion",
        "keywords": ["進制", "十進位", "八進位", "轉換"]
    },
    {
        "id": "guess_number",
        "title": "終極密碼",
        "category": "課堂作業",
        "description": "在逐步縮小的數字範圍內猜出答案。",
        "endpoint": "schoolassignment.guess_number",
        "keywords": ["猜數字", "終極密碼", "遊戲", "範圍"]
    },
    {
        "id": "text_validation",
        "title": "文字驗證",
        "category": "課堂作業",
        "description": "判斷輸入內容是否為身分證、手機或 Email。",
        "endpoint": "schoolassignment.text_validation",
        "keywords": ["驗證", "UID", "手機", "Email", "文字"]
    },
    {
        "id": "one_a_two_b",
        "title": "1A2B",
        "category": "課堂作業",
        "description": "四位不重複數字的邏輯猜題遊戲。",
        "endpoint": "schoolassignment.one_a_two_b",
        "keywords": ["1A2B", "猜數字", "邏輯", "遊戲"]
    },
    {
        "id": "pascal_triangle",
        "title": "巴斯卡三角形",
        "category": "課堂作業",
        "description": "依照指定層數建立 Pascal Triangle。",
        "endpoint": "schoolassignment.pascal_triangle",
        "keywords": ["巴斯卡", "Pascal", "三角形", "數學"]
    },
    {
        "id": "morse_code",
        "title": "摩斯密碼",
        "category": "課堂作業",
        "description": "在英數文字與摩斯密碼之間轉換。",
        "endpoint": "schoolassignment.morse_code",
        "keywords": ["摩斯", "Morse", "密碼", "轉換"]
    },
    {
        "id": "race_game",
        "title": "賽跑遊戲",
        "category": "課堂作業",
        "description": "使用 JavaScript 製作的賽跑互動遊戲。",
        "endpoint": "schoolassignment.race_game",
        "keywords": ["賽跑", "JavaScript", "遊戲"]
    },
    {
        "id": "relay_race",
        "title": "大隊接力",
        "category": "課堂作業",
        "description": "多人接力概念的網頁互動作品。",
        "endpoint": "schoolassignment.relay_race",
        "keywords": ["大隊接力", "接力", "JavaScript", "遊戲"]
    },
    {
        "id": "thread_pool_executor",
        "title": "ThreadPoolExecutor",
        "category": "課堂作業",
        "description": "比較多執行緒任務與執行時間。",
        "endpoint": "schoolassignment.thread_pool_executor",
        "keywords": ["Thread", "ThreadPoolExecutor", "執行緒", "多工"]
    },
    {
        "id": "rock_paper_scissors",
        "title": "剪刀石頭布",
        "category": "課堂作業",
        "description": "與電腦進行剪刀石頭布並記錄結果。",
        "endpoint": "schoolassignment.rock_paper_scissors",
        "keywords": ["剪刀", "石頭", "布", "遊戲"]
    },
    {
        "id": "ml_usa_housing",
        "title": "USA 房價預測",
        "category": "機器學習",
        "description": "使用 Linear Regression 預測美國房價。",
        "endpoint": "schoolassignment.usa_housing",
        "keywords": ["USA", "房價", "Linear Regression", "迴歸", "機器學習"]
    },
    {
        "id": "ml_ecommerce",
        "title": "電商年度消費預測",
        "category": "機器學習",
        "description": "使用迴歸模型預測會員年度消費金額。",
        "endpoint": "schoolassignment.ecommerce_customers",
        "keywords": ["電商", "年度消費", "迴歸", "機器學習"]
    },
    {
        "id": "ml_advertising",
        "title": "廣告點擊預測",
        "category": "機器學習",
        "description": "使用分類模型預測使用者是否點擊廣告。",
        "endpoint": "schoolassignment.advertising_prediction",
        "keywords": ["廣告", "點擊", "Logistic Regression", "分類", "機器學習"]
    },
    {
        "id": "ml_titanic",
        "title": "Titanic 生存預測",
        "category": "機器學習",
        "description": "依照艙等、性別與年齡預測生還機率。",
        "endpoint": "schoolassignment.titanic_prediction",
        "keywords": ["Titanic", "鐵達尼", "生存", "分類", "機器學習"]
    },
    {
        "id": "ml_mnist",
        "title": "MNIST 手寫數字辨識",
        "category": "機器學習",
        "description": "使用 KNeighborsClassifier 辨識手寫數字。",
        "endpoint": "schoolassignment.mnist_prediction",
        "keywords": ["MNIST", "手寫數字", "KNN", "KNeighborsClassifier", "機器學習"],
        "featured": True
    },
    {
        "id": "deep_usa_housing",
        "title": "深度學習 USA 房價預測",
        "category": "深度學習",
        "description": "使用 PyTorch MLP 神經網路預測美國房價。",
        "endpoint": "schoolassignment.deep_usa_housing",
        "keywords": ["USA", "房價", "PyTorch", "MLP", "深度學習"]
    },
    {
        "id": "deep_ecommerce",
        "title": "深度學習電商年度消費預測",
        "category": "深度學習",
        "description": "使用神經網路預測會員年度消費金額。",
        "endpoint": "schoolassignment.deep_ecommerce_customers",
        "keywords": ["電商", "年度消費", "PyTorch", "深度學習"]
    },
    {
        "id": "deep_advertising",
        "title": "深度學習廣告點擊預測",
        "category": "深度學習",
        "description": "使用神經網路預測使用者是否點擊廣告。",
        "endpoint": "schoolassignment.deep_advertising_prediction",
        "keywords": ["廣告", "點擊", "PyTorch", "分類", "深度學習"]
    },
    {
        "id": "deep_titanic",
        "title": "深度學習 Titanic 生存預測",
        "category": "深度學習",
        "description": "使用 PyTorch 神經網路預測 Titanic 生還機率。",
        "endpoint": "schoolassignment.deep_titanic_prediction",
        "keywords": ["Titanic", "鐵達尼", "生存", "PyTorch", "深度學習"]
    },
    {
        "id": "deep_mnist",
        "title": "深度學習 MNIST 手寫數字辨識",
        "category": "深度學習",
        "description": "使用 PyTorch MLP 辨識手寫數字。",
        "endpoint": "schoolassignment.deep_mnist_prediction",
        "keywords": ["MNIST", "手寫數字", "PyTorch", "MLP", "深度學習"],
        "featured": True
    },
    {
        "id": "flight_system",
        "title": "桃園機場航班查詢系統",
        "category": "作品集",
        "description": "查詢桃園機場航班、方向、狀態與延誤資訊。",
        "endpoint": "portfolio_bp.flight_system",
        "keywords": ["桃園機場", "航班", "TDX", "航空公司", "延誤", "飛機"],
        "featured": True
    },
    {
        "id": "flight_analysis",
        "title": "航班分析總覽",
        "category": "作品集",
        "description": "統計航班方向、客貨機、延誤與取消狀態。",
        "endpoint": "portfolio_bp.flight_analysis",
        "keywords": ["航班", "分析", "統計", "延誤", "取消", "TDX"],
        "featured": True
    },
    {
        "id": "medical_analysis",
        "title": "醫療數據分析",
        "category": "作品集",
        "description": "互動分析臺灣抗憂鬱藥物使用人數、性別、年齡與地區趨勢。",
        "endpoint": "portfolio_bp.medical_analysis",
        "keywords": ["醫療", "健保", "抗憂鬱藥物", "性別", "年齡", "縣市", "圖表", "衛福部"],
        "featured": True
    },
    {
        "id": "knee_quality_analysis",
        "title": "人工膝關節品質分析",
        "category": "作品集",
        "description": "分析人工膝關節置換傷口感染率，支援會員獨立匯入、手動輸入、資料驗證與匯出。",
        "endpoint": "portfolio_bp.knee_quality_analysis",
        "keywords": ["醫療", "健保", "人工膝關節", "感染率", "醫療品質", "CSV", "資料匯入", "資料匯出"],
        "featured": True
    },
    {
        "id": "platform_game",
        "title": "2D小遊戲",
        "category": "作品集",
        "description": "結合橫向卷軸、輕度肉鴿與生存戰鬥的原創 HTML5 Canvas 遊戲。",
        "endpoint": "portfolio_bp.platform_game",
        "keywords": ["2D", "橫向卷軸", "肉鴿", "生存遊戲", "Canvas", "JavaScript", "角色養成"],
        "featured": True
    }
]
