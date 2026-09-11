import pandas as pd
import numpy as np

# ==========================================
# STEP 1: GENERATE THE MOCK DATA
# ==========================================
def generate_mock_data(filename):
    print(f"Creating mock dataset at: {filename}...")
    data = {
        'timestamp': pd.date_range(start='2026-06-01 00:00', periods=10, freq='15min'),
        'meter_id': ['SM-Z01-001'] * 10,
        'zone_id': ['Zone_01'] * 10,
        'zone_name': ['Downtown Commercial'] * 10,
        'zone_type': ['Commercial'] * 10,
        # Notice the spike to 95.5 at the 6th row (an anomaly!)
        'energy_consumption_kwh': [37.8, 33.6, 37.0, 35.3, 35.4, 95.5, 36.1, 35.8, 37.2, 36.5],
        'reactive_power_kvarh': [14.2] * 10,
        'voltage_v': [230.0] * 10,
        'current_a': [650.0] * 10,
        'power_factor': [0.93] * 10,
        'grid_frequency_hz': [50.0] * 10,
        'ambient_temp_c': [24.0] * 10,
        'is_synthetic_anomaly': [0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
        'anomaly_type': ['Normal', 'Normal', 'Normal', 'Normal', 'Normal', 'Surge', 'Normal', 'Normal', 'Normal', 'Normal']
    }
    df = pd.DataFrame(data)
    df.to_csv(filename, index=False)
    print("Success! Raw data created in your current folder.\n")

# ==========================================
# STEP 2: PREPROCESS THE DATA
# ==========================================
def preprocess_smart_grid_data(input_file, output_file):
    print("1. Loading raw IoT data...")
    df = pd.read_csv(input_file)
    
    print("2. Cleaning data and handling timestamps...")
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values(by=['meter_id', 'timestamp'])
    df['energy_consumption_kwh'] = df.groupby('meter_id')['energy_consumption_kwh'].ffill()
    
    print("3. Running Anomaly Detection (Calculating Z-Scores)...")
    window_size = 4 
    
    # .shift(1) ensures the current reading doesn't skew the rolling average
    df['Rolling_Mean'] = df.groupby('meter_id')['energy_consumption_kwh'].transform(
        lambda x: x.shift(1).rolling(window=window_size, min_periods=1).mean()
    )
    df['Rolling_Std'] = df.groupby('meter_id')['energy_consumption_kwh'].transform(
        lambda x: x.shift(1).rolling(window=window_size, min_periods=1).std()
    )
    
    # Fill empty values created by the shift
    df['Rolling_Mean'] = df['Rolling_Mean'].bfill().fillna(df['energy_consumption_kwh'])
    df['Rolling_Std'] = df['Rolling_Std'].bfill().fillna(0)
    
    # Calculate Z-Score
    df['Z_Score'] = np.where(
        df['Rolling_Std'] > 0, 
        (df['energy_consumption_kwh'] - df['Rolling_Mean']) / df['Rolling_Std'], 
        0
    )
    
    threshold = 2.0
    df['Detected_Anomaly'] = np.where(np.abs(df['Z_Score']) > threshold, True, False)
    
    print("4. Saving clean data for Power BI...")
    df.to_csv(output_file, index=False)
    
    print(f"\n--- Processing Complete ---")
    print(f"Total Rows Processed: {len(df)}")
    print(f"Anomalies Detected by Algorithm: {df['Detected_Anomaly'].sum()}") 
    print(f"Clean file ready: {output_file}")

# ==========================================
# STEP 3: RUN BOTH FUNCTIONS
# ==========================================
raw_file = 'raw_smart_grid_data.csv'

# Changed this filename so Windows doesn't lock us out!
clean_file = 'dashboard_ready_data_v2.csv'

generate_mock_data(raw_file)
preprocess_smart_grid_data(raw_file, clean_file)