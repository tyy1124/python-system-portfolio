# TYY 小站正式程式路徑

正式部署與後續修改以以下路徑為準：

- `app.py`：Flask 主程式與會員功能
- `models.py`：正式資料模型
- `routes/portfolio_routes.py`：作品集功能，使用 `portfolio_bp`
- `routes/schoolassignment_routes.py`：練習、機器學習與深度學習功能
- `templates/`：正式頁面
- `static/`：正式前端資源
- `flight_update.py`：TDX 航班清洗與批次寫入
- `site_updates.py`：每日更新公告

以下目錄不屬於正式執行路徑，部署時由 `.slugignore` 排除：

- `training/`：模型訓練與歷史副本
- `routes/routes/`：舊路由副本
- `dist/`：套版展示範例

不要在上述副本修正正式網站功能，避免修改未被 Flask 載入的檔案。

## 資料庫啟動

- 本機預設允許 `db.create_all()`，方便建立空白開發資料庫。
- Heroku 預設不在 worker 啟動時建表，避免多 worker 競爭。
- 全新正式資料庫需要暫時設定 `AUTO_CREATE_DB=1` 完成初次建表，完成後移除。
- 後續結構變更應逐步改用 migration，不以 `create_all()` 取代欄位遷移。
