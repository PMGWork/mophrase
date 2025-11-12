# MoPhrase

MoPhrase is an interactive web application that converts freehand drawings into smooth Bézier curves using advanced curve fitting algorithms.

## このアプリケーションについて / About This Application

MoPhraseは、手描きの曲線を滑らかなベジェ曲線に自動変換するインタラクティブなWebアプリケーションです。描画した曲線は数学的に最適化されたベジェ曲線として表現され、制御点（ハンドル）を使って自由に編集できます。

MoPhrase is an interactive web application that automatically converts freehand curves into mathematically optimized Bézier curves. The drawn curves are represented as Bézier curves and can be freely edited using control points (handles).

## 主な機能 / Key Features

### 日本語

- **フリーハンド描画**: マウスやタッチで自由に曲線を描画
- **自動ベジェ曲線フィッティング**: 描画した曲線を滑らかなベジェ曲線に自動変換
- **制御点の編集**: ベジェ曲線の制御点（ハンドル）をドラッグして曲線を編集
- **表示切替**: 元の手描き線とベジェハンドルの表示/非表示を切り替え可能
- **誤差閾値調整**: スライダーでフィッティングの精度を調整

### English

- **Freehand Drawing**: Draw curves freely with mouse or touch input
- **Automatic Bézier Curve Fitting**: Automatically converts drawn curves into smooth Bézier curves
- **Control Point Editing**: Edit curves by dragging Bézier control points (handles)
- **Display Toggle**: Toggle visibility of original hand-drawn lines and Bézier handles
- **Error Threshold Adjustment**: Adjust fitting precision with a slider

## 技術スタック / Technology Stack

- **TypeScript**: Type-safe JavaScript
- **p5.js**: Canvas rendering and drawing
- **Vite**: Fast build tool and development server
- **Tailwind CSS**: Utility-first CSS framework

## セットアップ / Setup

### 必要要件 / Prerequisites

- Node.js (v16 or higher recommended)
- npm or yarn

### インストール / Installation

```bash
# リポジトリをクローン / Clone the repository
git clone https://github.com/PMGWork/mophrase.git
cd mophrase

# 依存関係をインストール / Install dependencies
npm install

# 開発サーバーを起動 / Start development server
npm run dev

# 本番用ビルド / Build for production
npm run build

# ビルドのプレビュー / Preview production build
npm run preview
```

## 使い方 / How to Use

### 日本語

1. **描画**: マウスをドラッグして曲線を描きます
2. **編集**: 描画後、制御点（四角と円のマーカー）をドラッグして曲線を調整します
3. **Shiftキー**: Shiftキーを押しながらドラッグすると、反対側の制御点も連動して動きます
4. **表示切替**: 
   - "Hide Handles" ボタン: ベジェハンドルの表示/非表示
   - "Hide Sketch" ボタン: 元の手描き線の表示/非表示
5. **閾値調整**: スライダーでフィッティングの精度を調整（値が小さいほど元の線に忠実）
6. **クリア**: "Clear" ボタンで全てをクリア

### English

1. **Draw**: Drag the mouse to draw curves
2. **Edit**: After drawing, drag control points (square and circle markers) to adjust curves
3. **Shift Key**: Hold Shift while dragging to move opposite control points in tandem
4. **Toggle Display**:
   - "Hide Handles" button: Toggle Bézier handle visibility
   - "Hide Sketch" button: Toggle original hand-drawn line visibility
5. **Adjust Threshold**: Use slider to adjust fitting precision (lower values = more faithful to original)
6. **Clear**: "Clear" button to clear everything

## コード構造 / Code Structure

### ファイル構成 / File Structure

```
src/
├── main.ts          # アプリケーションのメインエントリーポイント / Main application entry point
├── types.ts         # 型定義 / Type definitions
├── fitting.ts       # ベジェ曲線フィッティングアルゴリズム / Bézier curve fitting algorithms
├── mathUtils.ts     # 数学関数（ベルンシュタイン多項式など） / Mathematical utilities
├── draw.ts          # 描画関数 / Drawing functions
├── handle.ts        # 制御点の操作 / Handle controller for control points
└── gemini.ts        # Gemini API統合（未使用） / Gemini API integration (unused)
```

### 主要コンポーネント / Main Components

#### `main.ts`
アプリケーションの中核。p5.jsのスケッチを定義し、以下を管理します：
- ユーザー入力の処理
- 描画状態の管理
- UIイベントリスナー

The application core. Defines the p5.js sketch and manages:
- User input handling
- Drawing state management
- UI event listeners

#### `fitting.ts`
ベジェ曲線フィッティングアルゴリズムの実装。主要な処理：
- 点列からの接線ベクトル計算
- 最小二乗法による制御点の最適化
- ニュートン法によるパラメータの精密化
- 再帰的な曲線分割

Implements Bézier curve fitting algorithms. Main processes:
- Tangent vector computation from point sequences
- Control point optimization using least squares method
- Parameter refinement using Newton's method
- Recursive curve subdivision

#### `mathUtils.ts`
数学的ユーティリティ関数：
- ベルンシュタイン多項式の計算
- ベジェ曲線の評価
- 曲線の微分計算

Mathematical utility functions:
- Bernstein polynomial computation
- Bézier curve evaluation
- Curve derivative calculations

#### `handle.ts`
ベジェ曲線の制御点操作を管理。制御点のドラッグによる曲線編集をサポート。

Manages Bézier curve control point manipulation. Supports curve editing via control point dragging.

#### `draw.ts`
p5.jsを使用した描画機能：
- 入力点列の描画
- ベジェ曲線の描画
- 制御点と制御ポリゴンの描画

Drawing functions using p5.js:
- Drawing input point sequences
- Drawing Bézier curves
- Drawing control points and control polygons

## アルゴリズム / Algorithm

### ベジェ曲線フィッティング / Bézier Curve Fitting

このアプリケーションは、手描きの点列から3次ベジェ曲線を自動生成します。アルゴリズムの主要なステップ：

This application automatically generates cubic Bézier curves from hand-drawn point sequences. Main algorithm steps:

1. **接線計算 / Tangent Calculation**: 点列の始点と終点での接線ベクトルを計算
2. **パラメータ化 / Parameterization**: 点列を曲線パラメータ空間にマッピング
3. **制御点最適化 / Control Point Optimization**: 最小二乗法で最適な制御点を計算
4. **誤差評価 / Error Evaluation**: フィッティング誤差を計算
5. **精密化 / Refinement**: ニュートン法でパラメータを改善
6. **再帰的分割 / Recursive Subdivision**: 誤差が大きい場合は曲線を分割して再フィッティング

### 数学的基礎 / Mathematical Foundation

- **ベルンシュタイン多項式 / Bernstein Polynomials**: ベジェ曲線の基底関数
- **最小二乗法 / Least Squares Method**: 制御点の最適化に使用
- **ニュートン・ラフソン法 / Newton-Raphson Method**: パラメータの精密化に使用

## ライセンス / License

This project's license information is not specified. Please contact the repository owner for licensing details.

## 貢献 / Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 開発者 / Developer

Developed by PMGWork
