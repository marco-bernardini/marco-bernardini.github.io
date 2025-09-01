import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import statsmodels.api as sm
import seaborn as sns
import math
from matplotlib.ticker import PercentFormatter
import matplotlib.colors as mcolors
from matplotlib import font_manager
import datetime
import matplotlib.patches as mpatches
import matplotlib.ticker as mtick
from scipy.optimize import curve_fit
import warnings
import ipywidgets as widgets
from ipywidgets import interact
import eurostat


font_path = "C:\\Users\\Marco\\Downloads\\Inter\\Inter-VariableFont_opsz,wght.ttf"
font_manager.fontManager.addfont(font_path)
bold_font_path = "C:\\Users\\Marco\\Downloads\\Inter\\static\\Inter_18pt-Bold.ttf"
font_manager.fontManager.addfont(bold_font_path)

plt.style.use('bmh')
bmh_colors = ['#348ABD', '#a60628']


plt.rcParams.update({
    'figure.facecolor': 'white',
    'axes.facecolor': 'white',

    'font.family': 'Inter',
    'axes.titleweight': 'bold',
    'axes.titlepad': 10,
    'axes.labelsize': 10,
    'axes.titlesize': 14,
    'axes.titlecolor': '#525252',
    'axes.labelcolor': '#525252',
    'figure.titlesize': 18,
    'figure.titleweight': 'bold',
    "lines.linewidth": 2,

    'legend.fontsize': 10,
    'legend.facecolor': 'white',
    "legend.frameon": False,

    "axes.linewidth": 1.5,

    "xtick.color": "silver",
    "ytick.color": "silver",
    'xtick.labelsize': 10,
    'ytick.labelsize': 10,
    "xtick.major.width": 1.5,
    "ytick.major.width": 1.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.spines.left": True,  # Disable the left spine (y-axis)
    "axes.spines.bottom": True,

    # Grid settings
    "axes.grid": True,
    "grid.alpha": 0.2,
    "grid.linestyle": '--',
    "grid.linewidth": 0.7,
    "xtick.direction": "out",
    "ytick.direction": "out",
    "xtick.bottom": True,  # Keep x-ticks at the bottom
    "ytick.left": False,   # Remove y-ticks
})

def make_df_ECB(key, obs_name):
    """extracts data from the BCE datawarehouse"""
    url_ = 'https://sdw-wsrest.ecb.europa.eu/service/data/'
    format_ = '?format=csvdata'
    df = pd.read_csv(url_+key+format_)
    df = df[['TIME_PERIOD', 'OBS_VALUE']]
    df['TIME_PERIOD'] = pd.to_datetime(df['TIME_PERIOD'])
    df = df.set_index('TIME_PERIOD')
    df.columns = [obs_name]
    return df