# -*- coding: utf-8 -*-
"""
Created on Wed Jul  8 00:07:49 2026

@author: tyy801124
"""
# ==== route 版型 ============================================
# ==== 功能名稱 ==============================================

# @schoolassignment_bp.route("/route_name", methods=["GET", "POST"])
# def route_name():

#     input_value = None
#     result = None
#     error_message = None

#     if request.method == "POST":
#         print(request.form)

#         input_value = request.form.get("input_value")

#         # 這裡放原本 py 檔的計算邏輯
#         result = input_value

#     return render_template(
#         "route_name.html",
#         input_value=input_value,
#         result=result,
#         error_message=error_message
#     )
# ========================================
# ==== html 版型 =========================
# <form method="post" action="{{ url_for('schoolassignment.route_name') }}" onsubmit="return submitPageForm(this);">
#   <input type="text" name="input_value" class="form-control" required>
#   <button type="submit" class="btn btn-primary mt-3">送出</button>
# </form>

# {% if result is not none %}
#   <p>結果：{{ result }}</p>
# {% else %}
#   <p class="text-muted">尚未計算。</p>
# {% endif %}
# ========================================

from flask import Blueprint, render_template, request, session, jsonify
import random
import time
import concurrent.futures
from datetime import datetime
import os
import json
import joblib
import pandas as pd
import numpy as np
import torch as pt
from models import db, Airline, Flight, FlightStatus, MnistFeedbackSample
from input_validation import parse_bounded_float



# === 建立課堂作業 Blueprint ===
schoolassignment_bp = Blueprint("schoolassignment", __name__)

# === 載入已訓練完成的深度學習 USA 房價模型 ===
def load_deep_usa_housing_model():

    global deep_usa_model
    global deep_usa_x_scaler
    global deep_usa_y_scaler
    global deep_usa_r2
    global deep_usa_mae
    global deep_usa_final_loss

    # === 同一個 Python 程序已載入過，就直接使用記憶體中的模型 ===
    if deep_usa_model is not None:
        return (
            deep_usa_model,
            deep_usa_x_scaler,
            deep_usa_y_scaler,
            deep_usa_r2,
            deep_usa_mae,
            deep_usa_final_loss
        )

    # === 專案根目錄 ===
    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    # === 模型權重路徑 ===
    model_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_usa_housing.pth"
    )

    # === Scaler 與模型資訊路徑 ===
    bundle_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_usa_housing_bundle.joblib"
    )

    # === 確認模型檔案存在 ===
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_usa_housing.pth，"
            "請先執行 python training/train_deep_usa_housing.py"
        )

    if not os.path.exists(bundle_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_usa_housing_bundle.joblib，"
            "請先執行 python training/train_deep_usa_housing.py"
        )

    # === 載入 Scaler、模型評估結果與模型設定 ===
    model_bundle = joblib.load(bundle_path)

    deep_usa_x_scaler = model_bundle["x_scaler"]
    deep_usa_y_scaler = model_bundle["y_scaler"]
    deep_usa_r2 = model_bundle["r2"]
    deep_usa_mae = model_bundle["mae"]
    deep_usa_final_loss = model_bundle["final_loss"]

    input_size = model_bundle.get(
        "input_size",
        5
    )

    # === 建立相同結構的神經網路 ===
    deep_usa_model = DeepRegressionModel(
        input_size=input_size
    )

    # === 載入已訓練完成的權重 ===
    model_state = pt.load(
        model_path,
        map_location="cpu",
        weights_only=True
    )

    deep_usa_model.load_state_dict(
        model_state
    )

    # === 切換成預測模式 ===
    deep_usa_model.eval()

    return (
        deep_usa_model,
        deep_usa_x_scaler,
        deep_usa_y_scaler,
        deep_usa_r2,
        deep_usa_mae,
        deep_usa_final_loss
    )
# === 載入已訓練完成的深度學習電商年度消費模型 ===
def load_deep_ecommerce_customers_model():

    global deep_ecommerce_model
    global deep_ecommerce_x_scaler
    global deep_ecommerce_y_scaler
    global deep_ecommerce_r2
    global deep_ecommerce_mae
    global deep_ecommerce_final_loss

    if deep_ecommerce_model is not None:
        return (
            deep_ecommerce_model,
            deep_ecommerce_x_scaler,
            deep_ecommerce_y_scaler,
            deep_ecommerce_r2,
            deep_ecommerce_mae,
            deep_ecommerce_final_loss
        )

    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    model_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_ecommerce.pth"
    )

    bundle_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_ecommerce_bundle.joblib"
    )

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_ecommerce.pth"
        )

    if not os.path.exists(bundle_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_ecommerce_bundle.joblib"
        )

    model_bundle = joblib.load(
        bundle_path
    )

    deep_ecommerce_x_scaler = model_bundle["x_scaler"]
    deep_ecommerce_y_scaler = model_bundle["y_scaler"]
    deep_ecommerce_r2 = model_bundle["r2"]
    deep_ecommerce_mae = model_bundle["mae"]
    deep_ecommerce_final_loss = model_bundle["final_loss"]

    deep_ecommerce_model = DeepRegressionModel(
        input_size=model_bundle.get(
            "input_size",
            4
        )
    )

    model_state = pt.load(
        model_path,
        map_location="cpu",
        weights_only=True
    )

    deep_ecommerce_model.load_state_dict(
        model_state
    )

    deep_ecommerce_model.eval()

    return (
        deep_ecommerce_model,
        deep_ecommerce_x_scaler,
        deep_ecommerce_y_scaler,
        deep_ecommerce_r2,
        deep_ecommerce_mae,
        deep_ecommerce_final_loss
    )

# === 載入已訓練完成的深度學習廣告點擊模型 ===
def load_deep_advertising_prediction_model():

    global deep_advertising_model
    global deep_advertising_x_scaler
    global deep_advertising_accuracy
    global deep_advertising_final_loss

    if deep_advertising_model is not None:
        return (
            deep_advertising_model,
            deep_advertising_x_scaler,
            deep_advertising_accuracy,
            deep_advertising_final_loss
        )

    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    model_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_advertising.pth"
    )

    bundle_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_advertising_bundle.joblib"
    )

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_advertising.pth"
        )

    if not os.path.exists(bundle_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_advertising_bundle.joblib"
        )

    model_bundle = joblib.load(
        bundle_path
    )

    deep_advertising_x_scaler = model_bundle["x_scaler"]
    deep_advertising_accuracy = model_bundle["accuracy"]
    deep_advertising_final_loss = model_bundle["final_loss"]

    deep_advertising_model = DeepClassificationModel(
        input_size=model_bundle.get(
            "input_size",
            5
        ),
        output_size=model_bundle.get(
            "output_size",
            2
        )
    )

    model_state = pt.load(
        model_path,
        map_location="cpu",
        weights_only=True
    )

    deep_advertising_model.load_state_dict(
        model_state
    )

    deep_advertising_model.eval()

    return (
        deep_advertising_model,
        deep_advertising_x_scaler,
        deep_advertising_accuracy,
        deep_advertising_final_loss
    )

# === 載入已訓練完成的深度學習 Titanic 模型 ===
def load_deep_titanic_prediction_model():

    global deep_titanic_model
    global deep_titanic_x_scaler
    global deep_titanic_accuracy
    global deep_titanic_final_loss

    if deep_titanic_model is not None:
        return (
            deep_titanic_model,
            deep_titanic_x_scaler,
            deep_titanic_accuracy,
            deep_titanic_final_loss
        )

    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    model_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_titanic.pth"
    )

    bundle_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_titanic_bundle.joblib"
    )

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_titanic.pth"
        )

    if not os.path.exists(bundle_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_titanic_bundle.joblib"
        )

    model_bundle = joblib.load(
        bundle_path
    )

    deep_titanic_x_scaler = model_bundle["x_scaler"]
    deep_titanic_accuracy = model_bundle["accuracy"]
    deep_titanic_final_loss = model_bundle["final_loss"]

    deep_titanic_model = DeepClassificationModel(
        input_size=model_bundle.get(
            "input_size",
            3
        ),
        output_size=model_bundle.get(
            "output_size",
            2
        )
    )

    model_state = pt.load(
        model_path,
        map_location="cpu",
        weights_only=True
    )

    deep_titanic_model.load_state_dict(
        model_state
    )

    deep_titanic_model.eval()

    return (
        deep_titanic_model,
        deep_titanic_x_scaler,
        deep_titanic_accuracy,
        deep_titanic_final_loss
    )

# === 載入已訓練完成的深度學習 MNIST 模型 ===
def load_deep_mnist_prediction_model():

    global deep_mnist_model
    global deep_mnist_accuracy
    global deep_mnist_final_loss
    global deep_mnist_X_test
    global deep_mnist_y_test

    if deep_mnist_model is not None:
        return (
            deep_mnist_model,
            deep_mnist_accuracy,
            deep_mnist_final_loss,
            deep_mnist_X_test,
            deep_mnist_y_test
        )

    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    model_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_mnist.pth"
    )

    bundle_path = os.path.join(
        base_dir,
        "saved_models",
        "deep_mnist_bundle.joblib"
    )

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_mnist.pth"
        )

    if not os.path.exists(bundle_path):
        raise FileNotFoundError(
            "找不到 saved_models/deep_mnist_bundle.joblib"
        )

    model_bundle = joblib.load(
        bundle_path
    )

    deep_mnist_accuracy = model_bundle["accuracy"]
    deep_mnist_final_loss = model_bundle["final_loss"]
    deep_mnist_X_test = model_bundle["X_test"]
    deep_mnist_y_test = model_bundle["y_test"]

    deep_mnist_model = DeepClassificationModel(
        input_size=model_bundle.get(
            "input_size",
            784
        ),
        output_size=model_bundle.get(
            "output_size",
            10
        )
    )

    model_state = pt.load(
        model_path,
        map_location="cpu",
        weights_only=True
    )

    deep_mnist_model.load_state_dict(
        model_state
    )

    deep_mnist_model.eval()

    return (
        deep_mnist_model,
        deep_mnist_accuracy,
        deep_mnist_final_loss,
        deep_mnist_X_test,
        deep_mnist_y_test
    )



# === 載入已訓練完成的機器學習模型資料包 ===
def load_machine_learning_bundle(file_name):

    # === 同一個 Python 程序已載入過，就直接使用記憶體快取 ===
    if file_name in machine_learning_bundle_cache:
        return machine_learning_bundle_cache[file_name]

    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    model_path = os.path.join(
        base_dir,
        "saved_models",
        file_name
    )

    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"找不到 saved_models/{file_name}，"
            "請先執行 "
            "python training/train_remaining_machine_learning_models.py"
        )

    model_bundle = joblib.load(
        model_path
    )

    machine_learning_bundle_cache[file_name] = model_bundle

    return model_bundle


# === 載入已訓練完成的 MNIST 機器學習模型 ===
def load_mnist_model():

    global mnist_model
    global mnist_model_accuracy
    global mnist_X_test
    global mnist_y_test

    # === 同一個 Python 程序已載入過，就直接使用記憶體中的模型 ===
    if mnist_model is not None:
        return (
            mnist_model,
            mnist_model_accuracy,
            mnist_X_test,
            mnist_y_test
        )

    # === 專案根目錄 ===
    base_dir = os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )

    # === 已經在本機訓練完成的模型檔案 ===
    model_path = os.path.join(
        base_dir,
        "saved_models",
        "mnist_knn_bundle.joblib"
    )

    # === 確認模型檔案存在 ===
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            "找不到 saved_models/mnist_knn_bundle.joblib，"
            "請先執行 python training/train_mnist_model.py"
        )

    # === 從硬碟載入模型資料包，不再重新訓練 ===
    model_bundle = joblib.load(model_path)

    mnist_model = model_bundle["model"]
    mnist_model_accuracy = model_bundle["model_accuracy"]
    mnist_X_test = model_bundle["X_test"]
    mnist_y_test = model_bundle["y_test"]

    return (
        mnist_model,
        mnist_model_accuracy,
        mnist_X_test,
        mnist_y_test
    )

# === 深度學習：迴歸用 MLP 模型 ===
class DeepRegressionModel(pt.nn.Module):
    def __init__(self, input_size):
        super(DeepRegressionModel, self).__init__()

        self.fc1 = pt.nn.Linear(input_size, 64)
        self.fc2 = pt.nn.Linear(64, 32)
        self.fc3 = pt.nn.Linear(32, 1)

    def forward(self, x):
        x = pt.nn.functional.relu(self.fc1(x))
        x = pt.nn.functional.relu(self.fc2(x))
        x = self.fc3(x)
        return x

# === 深度學習：分類用 MLP 模型 ===
class DeepClassificationModel(pt.nn.Module):
    def __init__(self, input_size, output_size):
        super(DeepClassificationModel, self).__init__()

        self.fc1 = pt.nn.Linear(input_size, 64)
        self.fc2 = pt.nn.Linear(64, 32)
        self.fc3 = pt.nn.Linear(32, output_size)

    def forward(self, x):
        x = pt.nn.functional.relu(self.fc1(x))
        x = pt.nn.functional.relu(self.fc2(x))
        x = self.fc3(x)
        return x

# === 一般機器學習模型資料包快取 ===
machine_learning_bundle_cache = {}

# === MNIST 機器學習模型快取 ===
mnist_model = None
mnist_model_accuracy = None
mnist_X_test = None
mnist_y_test = None

# === 深度學習 USA 房價模型快取 ===
deep_usa_model = None
deep_usa_x_scaler = None
deep_usa_y_scaler = None
deep_usa_r2 = None
deep_usa_mae = None
deep_usa_final_loss = None

# === 深度學習 電商年度消費模型快取 ===
deep_ecommerce_model = None
deep_ecommerce_x_scaler = None
deep_ecommerce_y_scaler = None
deep_ecommerce_r2 = None
deep_ecommerce_mae = None
deep_ecommerce_final_loss = None

# === 深度學習 廣告點擊模型快取 ===
deep_advertising_model = None
deep_advertising_x_scaler = None
deep_advertising_accuracy = None
deep_advertising_final_loss = None

# === 深度學習 Titanic 生存預測模型快取 ===
deep_titanic_model = None
deep_titanic_x_scaler = None
deep_titanic_accuracy = None
deep_titanic_final_loss = None

# === 深度學習 MNIST 手寫數字辨識模型快取 ===
deep_mnist_model = None
deep_mnist_accuracy = None
deep_mnist_final_loss = None
deep_mnist_X_test = None
deep_mnist_y_test = None

#=====================================


# === 剪刀石頭布：進入頁面時清除資料 ===
@schoolassignment_bp.route("/rock_paper_scissors")
def rock_paper_scissors():
    session.pop("rps_win", None)
    session.pop("rps_tie", None)
    session.pop("rps_lose", None)

    session["rps_win"] = 0
    session["rps_tie"] = 0
    session["rps_lose"] = 0

    return render_template(
        "rock_paper_scissors.html",
        user_choice="",
        computer_choice="",
        result="",
        win=session["rps_win"],
        tie=session["rps_tie"],
        lose=session["rps_lose"]
    )

# === 剪刀石頭布 ===
@schoolassignment_bp.route("/rock_paper_scissors_play", methods=["POST"])
def rock_paper_scissors_play():
    user_choice = request.form.get("user_choice")

    choices = ["scissors", "stone", "paper"]
    computer_choice = random.choice(choices)

    choice_name = {
        "scissors": "剪刀",
        "stone": "石頭",
        "paper": "布"
    }

    session["rps_win"] = session.get("rps_win", 0)
    session["rps_tie"] = session.get("rps_tie", 0)
    session["rps_lose"] = session.get("rps_lose", 0)

    if user_choice == computer_choice:
        result = "平手"
        session["rps_tie"] += 1
    elif (
        user_choice == "scissors" and computer_choice == "paper"
        or user_choice == "stone" and computer_choice == "scissors"
        or user_choice == "paper" and computer_choice == "stone"
    ):
        result = "你贏了"
        session["rps_win"] += 1
    else:
        result = "你輸了"
        session["rps_lose"] += 1

    return render_template(
        "rock_paper_scissors.html",
        user_choice=choice_name.get(user_choice, ""),
        computer_choice=choice_name.get(computer_choice, ""),
        result=result,
        win=session["rps_win"],
        tie=session["rps_tie"],
        lose=session["rps_lose"]
    )

# === BMI ===
@schoolassignment_bp.route("/bmi", methods=["GET", "POST"])
def bmi():
    user_height = None
    user_weight = None
    BMI_result = None
    validation_error = None

    if request.method == "POST":
        user_height, height_error = parse_bounded_float(
            request.form.get("user_height"), "身高", 50, 250
        )
        user_weight, weight_error = parse_bounded_float(
            request.form.get("user_weight"), "體重", 2, 500
        )
        validation_error = height_error or weight_error

        if validation_error is None:
            BMI_height = user_height / 100
            BMI_result = round(user_weight / BMI_height ** 2, 2)

    return render_template(
        "bmi.html",
        user_height=user_height,
        user_weight=user_weight,
        BMI_result=BMI_result,
        validation_error=validation_error
    )

# === 三個數字比大小 ===
@schoolassignment_bp.route("/Comparing_the_sizes_of_three_numbers", methods=["GET", "POST"])
def Comparing_the_sizes_of_three_numbers():
    
    st_num = None
    nd_num = None
    rd_num = None
    maxinum = None
    minnum = None

    if request.method == "POST":

        st_num = float(request.form.get("st_num"))
        nd_num = float(request.form.get("nd_num"))
        rd_num = float(request.form.get("rd_num"))
        
        maxinum = max(st_num, nd_num, rd_num)
        minnum = min(st_num, nd_num, rd_num)

    return render_template(
        "Comparing_the_sizes_of_three_numbers.html",
        st_num = st_num,
        nd_num = nd_num,
        rd_num = rd_num,
        maxinum = maxinum,
        minnum = minnum
    )

# === 數字產生器 ===
@schoolassignment_bp.route("/digital_generator", methods=["GET", "POST"])
def digital_generator():
    
    maxinum = None
    minnum = None
    quantity = None
    max_result = None
    min_result = None
    avg_result = None
    result_text = None
    
    if request.method == "POST":

        maxinum = int(request.form.get("maxinum"))
        minnum = int(request.form.get("minnum"))
        quantity = int(request.form.get("quantity"))
        class Lotto:
    
            def __init__(self , minnum , maxinum , quantity):
                self.minnum = minnum 
                self.maxinum = maxinum
                self.quantity = quantity
                self.result = set()
        
            def Number_Generation(self):
        
                while self.quantity > len(self.result):
                    num = random.randint(self.minnum , self.maxinum )
                    self.result.add(num)
                return self.result
        
        class Math(Lotto):
        
            def max_result(self):
                max_num = (self.result)
                max_result = max(max_num)
            
                return max_result
            
            def min_result(self):
                min_num = (self.result)
                min_result = min(min_num)
            
                return min_result
    
            def avg_result(self):
                avg_num = (self.result)
                avg_result = sum(avg_num) / len(avg_num)
            
                return round(avg_result, 2)
            
        a = Math(minnum,maxinum,quantity)
        result = result = sorted(a.Number_Generation())
        result_text = "、".join(map(str, result))
        max_result = a.max_result()
        min_result = a.min_result()
        avg_result = a.avg_result()
        
        
    return render_template(
        "digital_generator.html",
        maxinum = maxinum,
        minnum = minnum,
        quantity = quantity,
        result = result_text,
        avg_result = avg_result,
        max_result = max_result,
        min_result = min_result,
    )

# === 費式數列 ===
@schoolassignment_bp.route("/fibonacci", methods=["GET", "POST"])
def fibonacci():
    quantity = None
    result_text = None
    
    if request.method == "POST":
        quantity = int(request.form.get("quantity"))
        number_list = []

        def make_fibonacci(quantity):
            a=1
            b=1
            for i in range(quantity):
                number_list.append(a)
                a,b = b, a+b
            return number_list
        result = make_fibonacci(quantity)
        result_text = "、".join(map(str, result))
    return render_template(
        "fibonacci.html",
        quantity = quantity,
        result = result_text
    )

# === TriStar ===
@schoolassignment_bp.route("/tristar", methods=["GET", "POST"])
def tristar():

    quantity = None
    result = None

    if request.method == "POST":
        quantity = int(request.form.get("quantity"))

        result = []

        for i in range(1, quantity + 1):
            spaces = " " * (quantity - i)
            star = "* " * i
            result.append(spaces + star)

    return render_template(
        "tristar.html",
        quantity=quantity,
        result=result
    )

# === 進制轉換 ===
@schoolassignment_bp.route("/baseconversion", methods=["GET", "POST"])
def baseconversion():
    
    original_num = None
    num_1 = None
    result = None
    
    if request.method == "POST":
        num_1 = int(request.form.get("num_1"))
        original_num = num_1
        result=''
        while num_1 > 0 :
            Remainder = num_1 % 8
            result = str(Remainder) + str(result)
            num_1 = num_1 // 8

        int(result)

    return render_template(
        "baseconversion.html",
        result=result,
        num_1=original_num
    )

# === 終極密碼：猜數字遊戲 ===
@schoolassignment_bp.route("/guess_number", methods=["GET", "POST"])
def guess_number():

    user_number = None
    message = None
    game_over = False

    # === 第一次進入頁面，初始化遊戲 ===
    if request.method == "GET":
        session["guess_answer"] = random.randint(1, 100)
        session["guess_min_number"] = 0
        session["guess_max_number"] = 100
        session["guess_count"] = 0

    # === POST：使用者送出猜測數字 ===
    if request.method == "POST":
        user_number = int(request.form.get("user_number"))

        answer = session.get("guess_answer")
        min_number = session.get("guess_min_number", 0)
        max_number = session.get("guess_max_number", 100)
        count = session.get("guess_count", 0)

        count += 1
        session["guess_count"] = count

        if user_number == answer:
            message = f"恭喜你猜中了，答案是 {answer}，你一共猜了 {count} 次"
            game_over = True

        elif user_number > min_number and user_number < answer:
            min_number = user_number
            session["guess_min_number"] = min_number
            message = f"猜測錯誤，請在 {min_number} ~ {max_number} 中再猜一個數字"

        elif user_number < max_number and user_number > answer:
            max_number = user_number
            session["guess_max_number"] = max_number
            message = f"猜測錯誤，請在 {min_number} ~ {max_number} 中再猜一個數字"

        else:
            message = f"超出範圍！請輸入 {min_number} 到 {max_number} 之間的數字"

    return render_template(
        "guess_number.html",
        user_number=user_number,
        min_number=session.get("guess_min_number", 0),
        max_number=session.get("guess_max_number", 100),
        count=session.get("guess_count", 0),
        message=message,
        game_over=game_over
    )

# === 文字驗證 ===
@schoolassignment_bp.route("/text_validation", methods=["GET", "POST"])
def text_validation():

    data = None
    result = None

    # === UID 判斷 ===
    def uid(data):
        if len(data) != 10:
            return False

        first_letter = ord(data[0])

        if first_letter < 65 or first_letter > 90:
            return False

        if data[1] != "1" and data[1] != "2":
            return False

        for i in data[2:]:
            if not ("0" <= i <= "9"):
                return False

        return True

    # === Mobile 判斷 ===
    def mobile(data):
        if len(data) != 10:
            return False

        if data[0:2] != "09":
            return False

        for i in data[2:]:
            if not ("0" <= i <= "9"):
                return False

        return True

    # === Email 判斷 ===
    def email(data):
        at = False

        for i in data:
            if i == "@":
                at = True

        if at == False:
            return False

        if len(data) < 3:
            return False

        if data[-3:] == "com":
            return True
        else:
            return False

    if request.method == "POST":
        data = request.form.get("data")

        if uid(data):
            result = "這是 UID"
        elif mobile(data):
            result = "這是 Mobile"
        elif email(data):
            result = "這是 E-mail"
        else:
            result = "這不是 UID、Mobile 或 E-mail"

    return render_template(
        "text_validation.html",
        data=data,
        result=result
    )

# === 1A2B 猜數字遊戲 ===
@schoolassignment_bp.route("/one_a_two_b", methods=["GET", "POST"])
def one_a_two_b():

    guess_text = None
    result = None
    message = None
    game_over = False

    # === GET：第一次進入頁面，產生答案 ===
    if request.method == "GET":
        answer = []

        while len(answer) < 4:
            num = random.randint(1, 9)

            if num not in answer:
                answer.append(num)

        session["onea2b_answer"] = answer
        session["onea2b_count"] = 0
        session["onea2b_history"] = []

        print("1A2B 答案：", answer)  # 測試用，正式展示可以刪掉

    # === POST：使用者猜測 ===
    if request.method == "POST":
        guess_text = request.form.get("guess_text", "").strip()

        answer = session.get("onea2b_answer")
        count = session.get("onea2b_count", 0)
        history = session.get("onea2b_history", [])

        # === 如果 session 不存在，重新產生答案，避免錯誤 ===
        if answer is None:
            answer = []

            while len(answer) < 4:
                num = random.randint(1, 9)

                if num not in answer:
                    answer.append(num)

            session["onea2b_answer"] = answer
            session["onea2b_count"] = 0
            session["onea2b_history"] = []
            history = []

        # === 輸入檢查 ===
        if len(guess_text) != 4:
            message = "請輸入 4 個數字"

        elif not guess_text.isdigit():
            message = "只能輸入數字"

        elif "0" in guess_text:
            message = "請輸入 1 到 9 的數字，不可包含 0"

        elif len(set(guess_text)) != 4:
            message = "數字不能重複"

        else:
            guess_list = []

            for i in guess_text:
                guess_list.append(int(i))

            a = 0
            b = 0

            for i in range(4):
                if guess_list[i] == answer[i]:
                    a += 1
                elif guess_list[i] in answer:
                    b += 1

            result = f"{a}A{b}B"

            count += 1
            session["onea2b_count"] = count

            history.append({
                "guess": guess_text,
                "result": result
            })

            session["onea2b_history"] = history

            if a == 4:
                message = f"恭喜你答對了！答案是 {guess_text}，你一共猜了 {count} 次"
                game_over = True
            else:
                message = "猜錯了，請繼續挑戰"

    return render_template(
        "one_a_two_b.html",
        guess_text=guess_text,
        result=result,
        message=message,
        count=session.get("onea2b_count", 0),
        history=session.get("onea2b_history", []),
        game_over=game_over
    )

# === 巴斯卡三角形 ===
@schoolassignment_bp.route("/pascal_triangle", methods=["GET", "POST"])
def pascal_triangle():

    level = None
    pascal = None

    if request.method == "POST":
        level = int(request.form.get("level"))

        pascal = []

        for i in range(level):
            row = [1]

            if i > 0:
                last_row = pascal[-1]

                for j in range(len(last_row) - 1):
                    row.append(last_row[j] + last_row[j + 1])

                row.append(1)

            pascal.append(row)

    return render_template(
        "pascal_triangle.html",
        level=level,
        pascal=pascal
    )

# === 摩斯密碼轉換 ===
@schoolassignment_bp.route("/morse_code", methods=["GET", "POST"])
def morse_code():

    mode = None
    user_input = None
    result = None
    error_message = None

    morselist = {
        ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E",
        "..-.": "F", "--.": "G", "....": "H", "..": "I", ".---": "J",
        "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O",
        ".--.": "P", "--.-": "Q", ".-.": "R", "...": "S", "-": "T",
        "..-": "U", "...-": "V", ".--": "W", "-..-": "X", "-.--": "Y", "--..": "Z",

        ".----": "1", "..---": "2", "...--": "3", "....-": "4", ".....": "5",
        "-....": "6", "--...": "7", "---..": "8", "----.": "9", "-----": "0",

        ".-.-.-": ".", "---...": ":", "--..--": ",", "-.-.-.": ";",
        "..--..": "?", "-...-": "=", "-..-.": "/", "-.-.--": "!",
        "-....-": "-", "..--.-": "_", "-.--.": "(", "-.--.-": ")",
        "...-..-": "$", ".-...": "&", ".--.-.": "@", ".-.-.": "+"
    }

    if request.method == "POST":
        mode = request.form.get("mode")
        user_input = request.form.get("user_input")

        if mode == "M":
            # === 摩斯密碼轉英數 ===
            morse_codes = user_input.split()
            result_list = []

            for code in morse_codes:
                if code == "/":
                    result_list.append(" ")
                elif code in morselist:
                    result_list.append(morselist[code])
                else:
                    error_message = f"無法辨識的摩斯密碼：{code}"
                    break

            if error_message is None:
                result = "".join(result_list)

        elif mode == "W":
            # === 英數轉摩斯密碼 ===
            reverse_morselist = {}

            for key, value in morselist.items():
                reverse_morselist[value] = key

            result_list = []

            for word in user_input.upper():
                if word == " ":
                    result_list.append("/")
                elif word in reverse_morselist:
                    result_list.append(reverse_morselist[word])
                else:
                    error_message = f"無法轉換的字元：{word}"
                    break

            if error_message is None:
                result = " ".join(result_list)

        else:
            error_message = "請選擇轉換模式"

    return render_template(
        "morse_code.html",
        mode=mode,
        user_input=user_input,
        result=result,
        error_message=error_message
    )

# === 賽跑遊戲 ===
@schoolassignment_bp.route("/race_game")
def race_game():
    return render_template("race_game.html")

# === 大隊接力 ===
@schoolassignment_bp.route("/relay_race")
def relay_race():
    return render_template("relay_race.html")

# === ThreadPoolExecutor ===
@schoolassignment_bp.route("/thread_pool_executor", methods=["GET", "POST"])
def thread_pool_executor():

    task_count = None
    max_workers = None
    max_num = None
    total_list = None
    total_sum = None
    execution_time = None
    error_message = None

    # === 單一任務：產生 1 個隨機數字 ===
    def random_num(max_num):
        nums = random.sample(range(max_num), max_num)
        num = random.choice(nums)
        return num

    if request.method == "POST":
        print(request.form)

        task_count = int(request.form.get("task_count"))
        max_workers = int(request.form.get("max_workers"))
        max_num = int(request.form.get("max_num"))

        # === 防呆限制，避免網頁卡太久 ===
        if task_count < 1 or task_count > 100:
            error_message = "任務數量請輸入 1 到 100 之間"

        elif max_workers < 1 or max_workers > 50:
            error_message = "Thread 數量請輸入 1 到 50 之間"

        elif max_num < 1000 or max_num > 100000:
            error_message = "數字範圍請輸入 1000 到 100000 之間"

        else:
            start_time = time.time()

            total_list = []

            # === 建立 ThreadPoolExecutor 多工池 ===
            with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:

                # === 建立任務 ===
                future_list = []

                for i in range(task_count):
                    future = executor.submit(random_num, max_num)
                    future_list.append(future)

                # === 收集完成的任務結果 ===
                for future in concurrent.futures.as_completed(future_list):
                    total_list.append(future.result())

            total_sum = sum(total_list)

            end_time = time.time()
            execution_time = round(end_time - start_time, 4)

    return render_template(
        "thread_pool_executor.html",
        task_count=task_count,
        max_workers=max_workers,
        max_num=max_num,
        total_list=total_list,
        total_sum=total_sum,
        execution_time=execution_time,
        error_message=error_message
    )

# === USA 房價預測 ===
@schoolassignment_bp.route("/usa_housing", methods=["GET", "POST"])
def usa_housing():

    area_income = None
    house_age = None
    number_of_rooms = None
    number_of_bedrooms = None
    area_population = None

    predict_price = None
    predict_price_text = None
    r2 = None
    mae = None
    error_message = None

    try:
        # === 載入已訓練完成的模型，不再於網頁請求中重新訓練 ===
        model_bundle = load_machine_learning_bundle(
            "ml_usa_housing_bundle.joblib"
        )

        model = model_bundle["model"]
        r2 = model_bundle["r2"]
        mae = model_bundle["mae"]
        feature_columns = model_bundle["feature_columns"]

        # === 使用者送出資料後，開始預測 ===
        if request.method == "POST":
            area_income = float(request.form.get("area_income"))
            house_age = float(request.form.get("house_age"))
            number_of_rooms = float(request.form.get("number_of_rooms"))
            number_of_bedrooms = float(request.form.get("number_of_bedrooms"))
            area_population = float(request.form.get("area_population"))

            user_data = pd.DataFrame(
                [[
                    area_income,
                    house_age,
                    number_of_rooms,
                    number_of_bedrooms,
                    area_population
                ]],
                columns=feature_columns
            )

            predict_price = model.predict(user_data)[0]
            predict_price_text = f"{predict_price:,.0f}"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的 USA 房價模型，"
            "請確認 saved_models/ml_usa_housing_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行房價預測時發生錯誤：{e}"

    return render_template(
        "usa_housing.html",
        area_income=area_income,
        house_age=house_age,
        number_of_rooms=number_of_rooms,
        number_of_bedrooms=number_of_bedrooms,
        area_population=area_population,
        predict_price=predict_price,
        predict_price_text=predict_price_text,
        r2=r2,
        mae=mae,
        error_message=error_message
    )

# === Titanic 生存預測 ===
@schoolassignment_bp.route("/titanic_prediction", methods=["GET", "POST"])
def titanic_prediction():

    pclass = None
    sex = None
    age = None

    survival_probability = None
    survival_probability_text = None
    prediction_result = None
    model_accuracy = None
    error_message = None

    try:
        # === 載入已訓練完成的模型，不再於網頁請求中重新訓練 ===
        model_bundle = load_machine_learning_bundle(
            "ml_titanic_bundle.joblib"
        )

        model = model_bundle["model"]
        model_accuracy = model_bundle["accuracy"]
        feature_columns = model_bundle["feature_columns"]

        # === 使用者送出資料後，開始預測 ===
        if request.method == "POST":
            pclass = int(request.form.get("pclass"))
            sex = request.form.get("sex")
            age = float(request.form.get("age"))

            # === 將使用者輸入的性別轉成模型看得懂的數字 ===
            if sex == "female":
                sex_value = 1
            else:
                sex_value = 0

            user_data = pd.DataFrame(
                [[
                    pclass,
                    sex_value,
                    age
                ]],
                columns=feature_columns
            )

            survival_probability = model.predict_proba(
                user_data
            )[0][1]

            survival_probability_text = (
                f"{survival_probability * 100:.2f}"
            )

            if survival_probability >= 0.5:
                prediction_result = "模型預測：可能生還"
            else:
                prediction_result = "模型預測：可能未生還"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的 Titanic 模型，"
            "請確認 saved_models/ml_titanic_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行 Titanic 生存預測時發生錯誤：{e}"

    return render_template(
        "titanic_prediction.html",
        pclass=pclass,
        sex=sex,
        age=age,
        survival_probability=survival_probability,
        survival_probability_text=survival_probability_text,
        prediction_result=prediction_result,
        model_accuracy=model_accuracy,
        error_message=error_message
    )

# === 電商年度消費預測 ===
@schoolassignment_bp.route("/ecommerce_customers", methods=["GET", "POST"])
def ecommerce_customers():

    avg_session_length = None
    time_on_app = None
    time_on_website = None
    length_of_membership = None

    predict_spent = None
    predict_spent_text = None
    r2 = None
    mae = None
    error_message = None

    try:
        # === 載入已訓練完成的模型，不再於網頁請求中重新訓練 ===
        model_bundle = load_machine_learning_bundle(
            "ml_ecommerce_bundle.joblib"
        )

        model = model_bundle["model"]
        r2 = model_bundle["r2"]
        mae = model_bundle["mae"]
        feature_columns = model_bundle["feature_columns"]

        # === 使用者送出資料後，開始預測 ===
        if request.method == "POST":
            avg_session_length = float(request.form.get("avg_session_length"))
            time_on_app = float(request.form.get("time_on_app"))
            time_on_website = float(request.form.get("time_on_website"))
            length_of_membership = float(request.form.get("length_of_membership"))

            user_data = pd.DataFrame(
                [[
                    avg_session_length,
                    time_on_app,
                    time_on_website,
                    length_of_membership
                ]],
                columns=feature_columns
            )

            predict_spent = model.predict(user_data)[0]
            predict_spent_text = f"{predict_spent:,.2f}"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的電商年度消費模型，"
            "請確認 saved_models/ml_ecommerce_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行電商年度消費預測時發生錯誤：{e}"

    return render_template(
        "ecommerce_customers.html",
        avg_session_length=avg_session_length,
        time_on_app=time_on_app,
        time_on_website=time_on_website,
        length_of_membership=length_of_membership,
        predict_spent=predict_spent,
        predict_spent_text=predict_spent_text,
        r2=r2,
        mae=mae,
        error_message=error_message
    )

# === 廣告點擊預測 ===
@schoolassignment_bp.route("/advertising_prediction", methods=["GET", "POST"])
def advertising_prediction():

    daily_time_spent = None
    age = None
    area_income = None
    daily_internet_usage = None
    male = None

    click_probability = None
    click_probability_text = None
    prediction_result = None
    model_accuracy = None
    error_message = None

    try:
        # === 載入已訓練完成的模型，不再於網頁請求中重新訓練 ===
        model_bundle = load_machine_learning_bundle(
            "ml_advertising_bundle.joblib"
        )

        model = model_bundle["model"]
        model_accuracy = model_bundle["accuracy"]
        feature_columns = model_bundle["feature_columns"]

        # === 使用者送出資料後，開始預測 ===
        if request.method == "POST":
            daily_time_spent = float(request.form.get("daily_time_spent"))
            age = int(request.form.get("age"))
            area_income = float(request.form.get("area_income"))
            daily_internet_usage = float(request.form.get("daily_internet_usage"))
            male = request.form.get("male")

            # === 資料集 Male 欄位：1 = 男性，0 = 女性 ===
            if male == "1":
                male_value = 1
            else:
                male_value = 0

            user_data = pd.DataFrame(
                [[
                    daily_time_spent,
                    age,
                    area_income,
                    daily_internet_usage,
                    male_value
                ]],
                columns=feature_columns
            )

            click_probability = model.predict_proba(
                user_data
            )[0][1]

            click_probability_text = (
                f"{click_probability * 100:.2f}"
            )

            if click_probability >= 0.5:
                prediction_result = "模型預測：可能會點擊廣告"
            else:
                prediction_result = "模型預測：可能不會點擊廣告"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的廣告點擊模型，"
            "請確認 saved_models/ml_advertising_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行廣告點擊預測時發生錯誤：{e}"

    return render_template(
        "advertising_prediction.html",
        daily_time_spent=daily_time_spent,
        age=age,
        area_income=area_income,
        daily_internet_usage=daily_internet_usage,
        male=male,
        click_probability=click_probability,
        click_probability_text=click_probability_text,
        prediction_result=prediction_result,
        model_accuracy=model_accuracy,
        error_message=error_message
    )


# === 驗證並整理使用者手寫的 784 個 MNIST 像素 ===
def normalize_handwritten_pixels(pixel_values):

    if not isinstance(pixel_values, list):
        raise ValueError("手寫資料格式錯誤")

    if len(pixel_values) != 784:
        raise ValueError("手寫資料必須包含 784 個像素")

    try:
        pixels = np.asarray(
            pixel_values,
            dtype=np.float32
        )
    except (TypeError, ValueError):
        raise ValueError("手寫資料包含無效數值")

    if not np.all(np.isfinite(pixels)):
        raise ValueError("手寫資料包含無效數值")

    # === 瀏覽器傳來的值應介於 0～1 ===
    pixels = np.clip(
        pixels,
        0.0,
        1.0
    )

    # === 後端再次判斷是否接近空白，避免繞過前端檢查 ===
    if float(np.sum(pixels)) < 3.0:
        raise ValueError("畫布是空白的，請先寫一個數字")

    return pixels


# === 使用指定的 MNIST 模型辨識手寫像素 ===
def predict_handwritten_digit(model_type, normalized_pixels):

    if model_type == "machine_learning":
        model, _, _, _ = load_mnist_model()

        model_input = normalized_pixels.reshape(
            1,
            -1
        )

        # === KNN 訓練時使用 DataFrame，保留原本欄位名稱 ===
        feature_names = getattr(
            model,
            "feature_names_in_",
            None
        )

        if feature_names is not None and len(feature_names) == 784:
            model_input = pd.DataFrame(
                model_input,
                columns=feature_names
            )

        predicted_label = int(
            model.predict(model_input)[0]
        )

        if hasattr(model, "predict_proba"):
            probabilities = model.predict_proba(model_input)[0]
            confidence = float(np.max(probabilities))
        else:
            confidence = 1.0

        return predicted_label, confidence

    if model_type == "deep_learning":
        model, _, _, _, _ = load_deep_mnist_prediction_model()

        model.eval()

        user_tensor = pt.tensor(
            normalized_pixels.reshape(1, -1),
            dtype=pt.float32
        )

        with pt.no_grad():
            output = model(user_tensor)
            probabilities = pt.nn.functional.softmax(
                output,
                dim=1
            ).numpy()[0]

        predicted_label = int(
            np.argmax(probabilities)
        )

        confidence = float(
            np.max(probabilities)
        )

        return predicted_label, confidence

    raise ValueError("不支援的模型類型")


# === 使用者真正手寫數字：模型辨識並建立等待回饋紀錄 ===
@schoolassignment_bp.route(
    "/mnist_handwriting_predict",
    methods=["POST"]
)
def mnist_handwriting_predict():

    account = session.get("account_login")

    if not account:
        return jsonify({
            "success": False,
            "message": "登入狀態已失效，請重新登入"
        }), 401

    data = request.get_json(
        silent=True
    ) or {}

    model_type = data.get(
        "model_type",
        ""
    )

    if model_type not in {
        "machine_learning",
        "deep_learning"
    }:
        return jsonify({
            "success": False,
            "message": "模型類型錯誤"
        }), 400

    try:
        normalized_pixels = normalize_handwritten_pixels(
            data.get("pixels")
        )

        predicted_label, confidence = predict_handwritten_digit(
            model_type,
            normalized_pixels
        )

        # === 資料庫保存 0～255 整數，方便後續直接匯出成 MNIST CSV ===
        stored_pixels = np.rint(
            normalized_pixels * 255
        ).astype(np.uint8).tolist()

        feedback_sample = MnistFeedbackSample(
            user_account=account,
            model_type=model_type,
            pixel_data=json.dumps(
                stored_pixels,
                separators=(",", ":")
            ),
            predicted_label=predicted_label,
            confidence=confidence,
            feedback_status="pending",
            used_for_training=False
        )

        db.session.add(
            feedback_sample
        )

        db.session.commit()

        return jsonify({
            "success": True,
            "sample_id": feedback_sample.id,
            "predicted_label": predicted_label,
            "confidence": round(
                confidence * 100,
                2
            ),
            "preview_pixels": stored_pixels
        })

    except ValueError as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 400

    except FileNotFoundError as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500

    except Exception as e:
        db.session.rollback()
        print("MNIST 手寫辨識錯誤：", e)

        return jsonify({
            "success": False,
            "message": "手寫辨識時發生錯誤，請稍後再試"
        }), 500


# === 使用者確認模型辨識正確或提供真正答案 ===
@schoolassignment_bp.route(
    "/mnist_feedback/<int:sample_id>",
    methods=["POST"]
)
def mnist_feedback(sample_id):

    account = session.get("account_login")

    if not account:
        return jsonify({
            "success": False,
            "message": "登入狀態已失效，請重新登入"
        }), 401

    sample = MnistFeedbackSample.query.filter_by(
        id=sample_id,
        user_account=account
    ).first()

    if sample is None:
        return jsonify({
            "success": False,
            "message": "找不到這筆辨識紀錄"
        }), 404

    if sample.feedback_status != "pending":
        return jsonify({
            "success": False,
            "message": "這筆辨識結果已經回報過了"
        }), 409

    data = request.get_json(
        silent=True
    ) or {}

    is_correct = data.get(
        "is_correct"
    )

    if not isinstance(is_correct, bool):
        return jsonify({
            "success": False,
            "message": "請選擇辨識結果正確或錯誤"
        }), 400

    if is_correct:
        correct_label = sample.predicted_label
    else:
        try:
            correct_label = int(
                data.get("correct_label")
            )
        except (TypeError, ValueError):
            return jsonify({
                "success": False,
                "message": "請選擇真正的數字答案"
            }), 400

        if correct_label < 0 or correct_label > 9:
            return jsonify({
                "success": False,
                "message": "正確答案必須是 0～9"
            }), 400

    sample.is_correct = is_correct
    sample.correct_label = correct_label
    sample.feedback_status = "confirmed"
    sample.feedback_at = datetime.utcnow()

    try:
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "感謝回饋，這筆手寫資料已保存",
            "correct_label": correct_label
        })

    except Exception as e:
        db.session.rollback()
        print("MNIST 回饋儲存錯誤：", e)

        return jsonify({
            "success": False,
            "message": "回饋儲存失敗，請稍後再試"
        }), 500


# === 機器學習：MNIST 手寫數字辨識 ===
@schoolassignment_bp.route("/mnist_prediction", methods=["GET", "POST"])
def mnist_prediction():

    prediction_result = None
    true_label = None
    is_correct = None
    confidence_text = None
    model_accuracy = None
    pixel_rows = None
    error_message = None

    try:
        # === 載入模型 ===
        model, model_accuracy, X_test, y_test = load_mnist_model()

        # === 使用者按下按鈕後，隨機抽一筆資料辨識 ===
        if request.method == "POST":

            random_index = random.randint(0, len(X_test) - 1)

            # === 抽出一筆測試資料 ===
            user_data = X_test.iloc[[random_index]]
            true_label = int(y_test.iloc[random_index])

            # === 模型預測 ===
            prediction_result = int(model.predict(user_data)[0])

            # === 取得信心分數 ===
            probability = model.predict_proba(user_data)[0]
            confidence = np.max(probability)
            confidence_text = f"{confidence * 100:.2f}"

            # === 判斷是否答對 ===
            if prediction_result == true_label:
                is_correct = True
            else:
                is_correct = False

            # === 將 784 個像素轉回 28 x 28，給 HTML 顯示圖片 ===
            pixels = user_data.values[0] * 255
            pixels = pixels.astype(int)
            pixel_rows = pixels.reshape(28, 28).tolist()

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的 MNIST 機器學習模型，"
            "請確認 saved_models/mnist_knn_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行 MNIST 手寫數字辨識時發生錯誤：{e}"

    return render_template(
        "mnist_prediction.html",
        prediction_result=prediction_result,
        true_label=true_label,
        is_correct=is_correct,
        confidence_text=confidence_text,
        model_accuracy=model_accuracy,
        pixel_rows=pixel_rows,
        error_message=error_message
    )

# === 深度學習：USA 房價預測 ===
@schoolassignment_bp.route("/deep_usa_housing", methods=["GET", "POST"])
def deep_usa_housing():

    area_income = None
    house_age = None
    number_of_rooms = None
    number_of_bedrooms = None
    area_population = None

    predict_price = None
    predict_price_text = None
    r2 = None
    mae = None
    final_loss = None
    error_message = None

    try:
        model, x_scaler, y_scaler, r2, mae, final_loss = load_deep_usa_housing_model()

        if request.method == "POST":

            area_income = float(request.form.get("area_income"))
            house_age = float(request.form.get("house_age"))
            number_of_rooms = float(request.form.get("number_of_rooms"))
            number_of_bedrooms = float(request.form.get("number_of_bedrooms"))
            area_population = float(request.form.get("area_population"))

            user_data = pd.DataFrame(
                [[
                    area_income,
                    house_age,
                    number_of_rooms,
                    number_of_bedrooms,
                    area_population
                ]],
                columns=[
                    "Avg. Area Income",
                    "Avg. Area House Age",
                    "Avg. Area Number of Rooms",
                    "Avg. Area Number of Bedrooms",
                    "Area Population"
                ]
            )

            # === 使用同一個 scaler 做標準化 ===
            user_data_scaled = x_scaler.transform(user_data)

            # === 轉 Tensor ===
            user_tensor = pt.tensor(user_data_scaled, dtype=pt.float32)

            # === 預測 ===
            model.eval()

            with pt.no_grad():
                predict_scaled = model(user_tensor).numpy()

            # === 把標準化後的預測值轉回原本房價 ===
            predict_price = y_scaler.inverse_transform(predict_scaled)[0][0]
            predict_price_text = f"{predict_price:,.0f}"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的深度學習 USA 房價模型，"
            "請確認 saved_models/deep_usa_housing.pth "
            "與 deep_usa_housing_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行深度學習 USA 房價預測時發生錯誤：{e}"

    return render_template(
        "deep_usa_housing.html",
        area_income=area_income,
        house_age=house_age,
        number_of_rooms=number_of_rooms,
        number_of_bedrooms=number_of_bedrooms,
        area_population=area_population,
        predict_price=predict_price,
        predict_price_text=predict_price_text,
        r2=r2,
        mae=mae,
        final_loss=final_loss,
        error_message=error_message
    )

# === 深度學習：電商年度消費預測 ===
@schoolassignment_bp.route("/deep_ecommerce_customers", methods=["GET", "POST"])
def deep_ecommerce_customers():

    avg_session_length = None
    time_on_app = None
    time_on_website = None
    length_of_membership = None

    predict_spent = None
    predict_spent_text = None
    r2 = None
    mae = None
    final_loss = None
    error_message = None

    try:
        model, x_scaler, y_scaler, r2, mae, final_loss = load_deep_ecommerce_customers_model()

        if request.method == "POST":

            avg_session_length = float(request.form.get("avg_session_length"))
            time_on_app = float(request.form.get("time_on_app"))
            time_on_website = float(request.form.get("time_on_website"))
            length_of_membership = float(request.form.get("length_of_membership"))

            user_data = pd.DataFrame(
                [[
                    avg_session_length,
                    time_on_app,
                    time_on_website,
                    length_of_membership
                ]],
                columns=[
                    "Avg. Session Length",
                    "Time on App",
                    "Time on Website",
                    "Length of Membership"
                ]
            )

            # === 使用同一個 scaler 做標準化 ===
            user_data_scaled = x_scaler.transform(user_data)

            # === 轉成 Tensor ===
            user_tensor = pt.tensor(user_data_scaled, dtype=pt.float32)

            # === 預測 ===
            model.eval()

            with pt.no_grad():
                predict_scaled = model(user_tensor).numpy()

            # === 把標準化後的預測值轉回原本年度消費金額 ===
            predict_spent = y_scaler.inverse_transform(predict_scaled)[0][0]
            predict_spent_text = f"{predict_spent:,.2f}"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的深度學習電商模型，"
            "請確認 saved_models/deep_ecommerce.pth "
            "與 deep_ecommerce_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行深度學習電商年度消費預測時發生錯誤：{e}"

    return render_template(
        "deep_ecommerce_customers.html",
        avg_session_length=avg_session_length,
        time_on_app=time_on_app,
        time_on_website=time_on_website,
        length_of_membership=length_of_membership,
        predict_spent=predict_spent,
        predict_spent_text=predict_spent_text,
        r2=r2,
        mae=mae,
        final_loss=final_loss,
        error_message=error_message
    )

# === 深度學習：廣告點擊預測 ===
@schoolassignment_bp.route("/deep_advertising_prediction", methods=["GET", "POST"])
def deep_advertising_prediction():

    daily_time_spent = None
    age = None
    area_income = None
    daily_internet_usage = None
    male = None

    click_probability = None
    click_probability_text = None
    prediction_result = None
    model_accuracy = None
    final_loss = None
    error_message = None

    try:
        model, x_scaler, model_accuracy, final_loss = load_deep_advertising_prediction_model()

        if request.method == "POST":

            daily_time_spent = float(request.form.get("daily_time_spent"))
            age = int(request.form.get("age"))
            area_income = float(request.form.get("area_income"))
            daily_internet_usage = float(request.form.get("daily_internet_usage"))
            male = request.form.get("male")

            # === 資料集 Male 欄位：1 = 男性，0 = 女性 ===
            if male == "1":
                male_value = 1
            else:
                male_value = 0

            user_data = pd.DataFrame(
                [[
                    daily_time_spent,
                    age,
                    area_income,
                    daily_internet_usage,
                    male_value
                ]],
                columns=[
                    "Daily Time Spent on Site",
                    "Age",
                    "Area Income",
                    "Daily Internet Usage",
                    "Male"
                ]
            )

            # === 使用同一個 scaler 標準化 ===
            user_data_scaled = x_scaler.transform(user_data)

            # === 轉成 Tensor ===
            user_tensor = pt.tensor(user_data_scaled, dtype=pt.float32)

            # === 預測 ===
            model.eval()

            with pt.no_grad():
                output = model(user_tensor)

                # === softmax 轉成機率 ===
                probability = pt.nn.functional.softmax(output, dim=1).numpy()[0]

            click_probability = probability[1]
            click_probability_text = f"{click_probability * 100:.2f}"

            if click_probability >= 0.5:
                prediction_result = "模型預測：可能會點擊廣告"
            else:
                prediction_result = "模型預測：可能不會點擊廣告"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的深度學習廣告點擊模型，"
            "請確認 saved_models/deep_advertising.pth "
            "與 deep_advertising_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行深度學習廣告點擊預測時發生錯誤：{e}"

    return render_template(
        "deep_advertising_prediction.html",
        daily_time_spent=daily_time_spent,
        age=age,
        area_income=area_income,
        daily_internet_usage=daily_internet_usage,
        male=male,
        click_probability=click_probability,
        click_probability_text=click_probability_text,
        prediction_result=prediction_result,
        model_accuracy=model_accuracy,
        final_loss=final_loss,
        error_message=error_message
    )

# === 深度學習：Titanic 生存預測 ===
@schoolassignment_bp.route("/deep_titanic_prediction", methods=["GET", "POST"])
def deep_titanic_prediction():

    pclass = None
    sex = None
    age = None

    survival_probability = None
    survival_probability_text = None
    prediction_result = None
    model_accuracy = None
    final_loss = None
    error_message = None

    try:
        model, x_scaler, model_accuracy, final_loss = load_deep_titanic_prediction_model()

        if request.method == "POST":

            pclass = int(request.form.get("pclass"))
            sex = request.form.get("sex")
            age = float(request.form.get("age"))

            # === 將使用者輸入的性別轉成模型看得懂的數字 ===
            if sex == "female":
                sex_value = 1
            else:
                sex_value = 0

            user_data = pd.DataFrame(
                [[
                    pclass,
                    sex_value,
                    age
                ]],
                columns=[
                    "Pclass",
                    "Sex",
                    "Age"
                ]
            )

            # === 使用同一個 scaler 標準化 ===
            user_data_scaled = x_scaler.transform(user_data)

            # === 轉成 Tensor ===
            user_tensor = pt.tensor(user_data_scaled, dtype=pt.float32)

            # === 預測 ===
            model.eval()

            with pt.no_grad():
                output = model(user_tensor)

                # === softmax 轉成機率 ===
                probability = pt.nn.functional.softmax(output, dim=1).numpy()[0]

            survival_probability = probability[1]
            survival_probability_text = f"{survival_probability * 100:.2f}"

            if survival_probability >= 0.5:
                prediction_result = "模型預測：可能生還"
            else:
                prediction_result = "模型預測：可能未生還"

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的深度學習 Titanic 模型，"
            "請確認 saved_models/deep_titanic.pth "
            "與 deep_titanic_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行深度學習 Titanic 生存預測時發生錯誤：{e}"

    return render_template(
        "deep_titanic_prediction.html",
        pclass=pclass,
        sex=sex,
        age=age,
        survival_probability=survival_probability,
        survival_probability_text=survival_probability_text,
        prediction_result=prediction_result,
        model_accuracy=model_accuracy,
        final_loss=final_loss,
        error_message=error_message
    )

# === 深度學習：MNIST 手寫數字辨識 ===
@schoolassignment_bp.route("/deep_mnist_prediction", methods=["GET", "POST"])
def deep_mnist_prediction():

    prediction_result = None
    true_label = None
    is_correct = None
    confidence_text = None
    model_accuracy = None
    final_loss = None
    pixel_rows = None
    error_message = None

    try:
        model, model_accuracy, final_loss, X_test, y_test = load_deep_mnist_prediction_model()

        # === 使用者按下按鈕後，隨機抽一筆資料辨識 ===
        if request.method == "POST":

            random_index = random.randint(0, len(X_test) - 1)

            # === 抽出一筆測試資料 ===
            user_data = X_test[random_index].reshape(1, -1)
            true_label = int(y_test[random_index])

            # === 轉成 Tensor ===
            user_tensor = pt.tensor(user_data, dtype=pt.float32)

            # === 模型預測 ===
            model.eval()

            with pt.no_grad():
                output = model(user_tensor)

                # === softmax 轉成機率 ===
                probability = pt.nn.functional.softmax(output, dim=1).numpy()[0]

            prediction_result = int(np.argmax(probability))

            confidence = np.max(probability)
            confidence_text = f"{confidence * 100:.2f}"

            # === 判斷是否答對 ===
            if prediction_result == true_label:
                is_correct = True
            else:
                is_correct = False

            # === 將 784 個像素轉回 28 x 28，給 HTML 顯示圖片 ===
            pixels = user_data.reshape(28, 28) * 255
            pixels = pixels.astype(int)
            pixel_rows = pixels.tolist()

    except FileNotFoundError:
        error_message = (
            "找不到已訓練的深度學習 MNIST 模型，"
            "請確認 saved_models/deep_mnist.pth "
            "與 deep_mnist_bundle.joblib 是否存在"
        )

    except Exception as e:
        error_message = f"執行深度學習 MNIST 手寫數字辨識時發生錯誤：{e}"

    return render_template(
        "deep_mnist_prediction.html",
        prediction_result=prediction_result,
        true_label=true_label,
        is_correct=is_correct,
        confidence_text=confidence_text,
        model_accuracy=model_accuracy,
        final_loss=final_loss,
        pixel_rows=pixel_rows,
        error_message=error_message
    )
