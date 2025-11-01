# Apollo AIR-1 Air Quality Sensor Analysis Report

## Comprehensive Measurement Ranges, Health Thresholds, and Visualization Recommendations

---

## **1. CO₂ (Carbon Dioxide)**

**Current Reading:** 821 ppm

**Recommended Y-Axis Range:** 0 - 2000 ppm (or 0 - 3000 ppm for flexibility)

**Health Thresholds:**
- **Excellent (0-400 ppm):** Outdoor air baseline
- **Good (400-800 ppm):** Optimal indoor air quality
- **Acceptable (800-1000 ppm):** Generally acceptable, minor ventilation improvement recommended
- **Moderate (1000-1400 ppm):** Drowsiness and reduced concentration possible; increase ventilation
- **Poor (1400-2000 ppm):** Headaches, fatigue, poor decision-making; ventilation required
- **Very Poor (>2000 ppm):** Significant health effects; immediate ventilation needed
- **Dangerous (>5000 ppm):** ACGIH 8-hour occupational limit

**Key Standards:**
- ASHRAE: Indoor CO₂ should be <700 ppm above outdoor levels (typically <1100 ppm total)
- 1000 ppm widely referenced as acceptable indoor limit
- EPA/WHO: Lower is better, aim for <800 ppm

**Recommended Time Range:** 6-24 hours (to observe daily occupancy patterns)

**Visualization Notes:** Add horizontal threshold lines at 800, 1000, 1400, and 2000 ppm with color zones (green/yellow/orange/red)

---

## **2. Particulate Matter (PM)**

### **PM 0.3 to 1 µm, PM 1 to 2.5 µm, PM 2.5 to 4 µm, PM 4 to 10 µm**

**Current Readings:**
- PM <1µm: 1.2 µg/m³
- PM <2.5µm: 1.3 µg/m³
- PM <4µm: 1.3 µg/m³
- PM <10µm: 1.3 µg/m³

**Recommended Y-Axis Range:** 0 - 50 µg/m³ (can extend to 100 µg/m³ for poor AQ events)

### **Health Thresholds for PM2.5:**
- **Excellent (0-5 µg/m³):** WHO annual guideline
- **Good (5-12 µg/m³):** EPA "Good" category
- **Moderate (12-35 µg/m³):** EPA acceptable 24-hour standard
- **Unhealthy for Sensitive Groups (35-55 µg/m³):** AQI orange
- **Unhealthy (55-150 µg/m³):** AQI red
- **Very Unhealthy (>150 µg/m³):** AQI purple

### **Health Thresholds for PM10:**
- **Excellent (0-15 µg/m³):** WHO annual guideline
- **Good (15-45 µg/m³):** WHO 24-hour guideline
- **Moderate (45-154 µg/m³):** EPA moderate AQI
- **Unhealthy (>154 µg/m³):** EPA unhealthy category

**Key Standards:**
- WHO PM2.5: 5 µg/m³ annual mean, 15 µg/m³ 24-hour mean
- EPA PM2.5: 9.0 µg/m³ annual, 35 µg/m³ 24-hour
- WHO PM10: 15 µg/m³ annual mean, 45 µg/m³ 24-hour mean

**Recommended Time Range:** 24 hours for daily patterns, with option for 7-day averages

**Visualization Notes:** Your current readings are EXCELLENT (well below WHO guidelines). Use log scale or 0-25 µg/m³ range for normal conditions to see variations. Add threshold lines at 5, 12, and 35 µg/m³ for PM2.5.

---

## **3. VOC (Volatile Organic Compounds) - SEN55 VOC Index**

**Current Reading:** 21 (VOC Index scale)

**Recommended Y-Axis Range:** 0 - 500 (VOC Index scale)

### **Health Thresholds (VOC Index):**
- **Excellent (0-50):** Significantly cleaner than average
- **Good (50-100):** Cleaner than or equal to average
- **Moderate (100-200):** Slightly elevated compared to average
- **Poor (200-300):** Elevated VOC levels
- **Very Poor (300-400):** Highly elevated
- **Hazardous (>400):** Severe VOC event

### **Alternative TVOC Thresholds (if measured in ppb/mg/m³):**
- **Excellent (<0.3 mg/m³ or <200 ppb):** Low concentration
- **Good (0.3-0.5 mg/m³ or 200-400 ppb):** Acceptable (WHO guideline)
- **Moderate (0.5-0.8 mg/m³ or 400-800 ppb):** Increase ventilation
- **Poor (0.8-2.2 mg/m³ or 800-2200 ppb):** Health effects likely
- **Very Poor (>2.2 mg/m³ or >2200 ppb):** Unhealthy

**Key Standards:**
- WHO: 0-400 ppb acceptable level
- VOC Index: 100 represents 24-hour average baseline
- Indoor VOC levels typically 2-5x higher than outdoors

**Recommended Time Range:** 24 hours (VOC Index baseline is 24-hour average)

**Visualization Notes:** Current reading of 21 is EXCELLENT. Add threshold lines at 100, 200, 300 with color zones.

---

## **4. NOx (Nitrogen Oxides) - SEN55 NOX Index**

**Current Reading:** 2 (NOx Index scale)

**Recommended Y-Axis Range:** 0 - 500 (NOx Index scale, similar to VOC)

### **Health Thresholds (if measured in ppb NO₂):**
- **Excellent (0-20 ppb):** Well below health concern
- **Good (20-53 ppb):** EPA annual standard
- **Moderate (53-100 ppb):** Approaching EPA 1-hour standard
- **Poor (100-200 ppb):** Above EPA 1-hour standard
- **Unhealthy (>200 ppb):** Respiratory irritation likely
- **Hazardous (>1000 ppb):** Severe health effects

### **Indoor Typical Levels:**
- **Without gas appliances:** 10-25 ppb
- **With gas stoves:** 25-75 ppb background, 200-2000+ ppb peaks

**Key Standards:**
- EPA NO₂: 100 ppb (0.1 ppm) 1-hour standard, 53 ppb annual
- No agreed-upon standards for indoor NO₂
- ASHRAE reference: 0.053 ppm outdoor standard

**Recommended Time Range:** 6-24 hours to capture cooking/activity spikes

**Visualization Notes:** Current reading of 2 is EXCELLENT. For NOx index, use similar thresholds as VOC (100 = average baseline).

---

## **5. Temperature - SEN55**

**Current Reading:** 22.3°C (72.1°F)

**Recommended Y-Axis Range:** 15-30°C (59-86°F) or 18-28°C for tighter view

### **Comfort Thresholds (ASHRAE 55):**
- **Cold (<18°C / 64°F):** Below comfort zone
- **Cool (18-20.5°C / 64-69°F):** Heating mode lower bound
- **Optimal Heating (20.5-24.5°C / 69-76°F):** ASHRAE heating season comfort
- **Optimal Cooling (23.5-25.5°C / 74-78°F):** ASHRAE cooling season comfort
- **Warm (25.5-27°C / 78-81°F):** Upper comfort boundary
- **Hot (>27°C / 81°F):** Above comfort zone

**General Comfort Range:** 20-26°C (68-79°F) for 80% satisfaction

**Key Standards:**
- ASHRAE 55-2017: 67-82°F (19.4-27.8°C) general range
- Winter: 68-74°F (20-23.3°C)
- Summer: 72-80°F (22.2-26.7°C)

**Recommended Time Range:** 24 hours to observe daily cycles

**Visualization Notes:** Current reading is OPTIMAL. Add comfort zone shading (20-26°C). Consider showing both °C and °F.

---

## **6. Humidity - SEN55**

**Current Reading:** 42.7%

**Recommended Y-Axis Range:** 0-100% (full scale) or 20-80% for focus

### **Health & Comfort Thresholds (ASHRAE):**
- **Too Dry (<30%):** Dry skin, static electricity, respiratory irritation
- **Good (30-40%):** Lower optimal range
- **Optimal (40-60%):** ASHRAE recommended comfort range
- **Moderate (60-70%):** Upper acceptable range; mold risk increases
- **High (70-80%):** Mold growth likely, discomfort
- **Very High (>80%):** Condensation, significant mold risk

**Key Standards:**
- ASHRAE: 30-60% RH recommended
- ASHRAE: Humidity ratio ≤0.012, dew point ≤16.8°C (62.2°F)

**Recommended Time Range:** 24 hours to observe daily variations

**Visualization Notes:** Current reading is OPTIMAL. Add horizontal lines at 30% and 60% with green shading between. Show mold risk zone (>70%) in red.

---

## **7. Carbon Monoxide (CO)**

**Current Reading:** 4.47 ppm

**Recommended Y-Axis Range:** 0-50 ppm (or 0-100 ppm for safety)

### **Health Thresholds:**
- **Excellent (0-1 ppm):** Outdoor air/ideal indoor
- **Good (1-5 ppm):** Typical indoor near gas appliances
- **Moderate (5-9 ppm):** EPA/WHO 8-hour maximum
- **Elevated (9-35 ppm):** EPA 1-hour maximum; health effects possible
- **Unhealthy (35-50 ppm):** OSHA 8-hour TWA limit; headaches, fatigue
- **Dangerous (50-200 ppm):** Severe symptoms within hours
- **Life-threatening (>200 ppm):** Fatal within hours

**Key Standards:**
- WHO: <9 ppm 8-hour average, <25 ppm 1-hour
- EPA: 9 ppm 8-hour, 35 ppm 1-hour (outdoor standards)
- OSHA: 50 ppm 8-hour TWA
- NIOSH: 35 ppm 8-hour TWA, 200 ppm ceiling
- Typical homes without gas: 0.5-5 ppm
- Near gas stoves: 5-15 ppm (properly adjusted), 30+ ppm (poorly adjusted)

**Recommended Time Range:** 6-24 hours with peak detection

**Visualization Notes:** Current reading is GOOD but elevated for residential (typical homes: 0.5-5 ppm). Add alarm threshold line at 9 ppm (EPA 8-hour) and 35 ppm (EPA 1-hour).

---

## **8. Methane (CH₄)**

**Current Reading:** 0.00 ppm

**Recommended Y-Axis Range:** 0-100 ppm (or 0-1000 ppm if near gas sources)

### **Safety Thresholds:**
- **Normal (0-5 ppm):** Background/outdoor levels
- **Elevated (5-1000 ppm):** Detectable, investigate source
- **High (1000-5000 ppm):** NIOSH 8-hour maximum (asphyxiation risk)
- **Dangerous (5000-50,000 ppm):** Emergency limit (oxygen displacement)
- **Explosive (>50,000 ppm / 5%):** Lower explosive limit

**Key Information:**
- Methane is biologically inert and non-toxic
- Primary hazards: asphyxiation (oxygen displacement) and explosion
- NIOSH: 1000 ppm (0.1%) maximum 8-hour exposure
- Emergency Exposure Limit: 5000 ppm
- Flammable range: 5-15% (50,000-150,000 ppm)

**Recommended Time Range:** Continuous monitoring with leak detection alerts

**Visualization Notes:** Methane is non-toxic but is an asphyxiant and explosive hazard. Primary concern is leak detection. Add threshold at 1000 ppm.

---

## **9. Ethanol Vapor**

**Current Reading:** 1.65 ppm

**Recommended Y-Axis Range:** 0-20 ppm (or 0-100 ppm for broader view)

### **Health Thresholds:**
- **Low (0-1 ppm):** Typical indoor background
- **Normal (1-5 ppm):** Common in occupied spaces (human respiration)
- **Elevated (5-100 ppm):** From cleaning products, hand sanitizers
- **High (100-1000 ppm):** Strong odor, investigate source
- **Very High (>1000 ppm):** Potential health effects
- **Occupational Limit (5200-10,400 ppm):** NIOSH discomfort threshold
- **Hazardous (>15,000 ppm):** IDLH level

**Key Standards:**
- Indoor levels commonly >1 ppm, sometimes >1000 µg/m³
- NIOSH IDLH: 15,000 ppm
- 15,000 ppm causes continuous lacrimation and coughing
- 5,200-10,400 ppm causes discomfort but work possible
- Human respiration contributes to indoor ethanol

**Recommended Time Range:** 6-24 hours to observe activity patterns

**Visualization Notes:** Current reading is NORMAL (human respiration contributes ethanol). Add threshold at 5 ppm and 100 ppm.

---

## **10. Hydrogen (H₂)**

**Current Reading:** 0.00 ppm

**Recommended Y-Axis Range:** 0-100 ppm (or 0-1000 ppm)

### **Safety Thresholds:**
- **Normal (0-10 ppm):** Background levels
- **Elevated (10-100 ppm):** Detectable, check for sources
- **High (100-1000 ppm):** Investigate potential leaks
- **Dangerous (>4% or 40,000 ppm):** Lower flammability limit
- **Explosive (4-75% or 40,000-750,000 ppm):** Flammability range

**Key Information:**
- Hydrogen is non-toxic and non-poisonous
- Primary hazards: asphyxiation (oxygen displacement) and explosion
- No established toxic exposure limits (simple asphyxiant)
- Highly flammable: ignites at 4% concentration in air
- Wide flammability range: 4-75%

**Recommended Time Range:** Continuous monitoring with leak alerts

**Visualization Notes:** Hydrogen is non-toxic but is an asphyxiant (oxygen displacement) and highly flammable. Primary concern is leak detection from fuel cells or industrial processes. No established toxic exposure limits.

---

## **11. Ammonia (NH₃)**

**Current Reading:** 1.14 ppm

**Recommended Y-Axis Range:** 0-50 ppm (or 0-10 ppm for residential focus)

### **Health Thresholds:**
- **Excellent (0-0.05 ppm / 32-70 ppb):** Typical outdoor/clean indoor
- **Good (0.05-1 ppm):** Slightly elevated, normal in occupied spaces
- **Odor Threshold (1.5 ppm):** Detectable smell
- **Moderate (1.5-20 ppm):** Odor aversion, investigate sources
- **Unhealthy (20-25 ppm):** OSHA 8-hour TWA, eye/airway irritation begins
- **Very Unhealthy (25-35 ppm):** OSHA 15-min STEL
- **Hazardous (>35 ppm):** Significant health effects

**Key Standards:**
- Chinese standard: 0.2 mg/m³ (0.29 ppm) limit
- OSHA: 25 ppm 8-hour TWA, 35 ppm 15-min STEL
- Odor threshold: 1.5 ppm (can be as low as 1.5 ppm)
- Sensory irritation threshold: 20-50 ppm
- Typical indoor: 10-70 ppb (background 32 ppb)
- Cooking spikes: up to 130 ppb
- Cleaning spikes: up to 1592 ppb

**Recommended Time Range:** 6-24 hours to capture activity-related spikes

**Visualization Notes:** Current reading is GOOD but approaching odor threshold. Add threshold lines at 1.5 ppm (odor), 20 ppm (irritation), and 25 ppm (OSHA limit).

---

## **12. Nitrogen Dioxide (NO₂)**

**Current Reading:** 0.17 ppm (170 ppb)

**Recommended Y-Axis Range:** 0-0.5 ppm or 0-500 ppb

### **Health Thresholds:**
- **Excellent (0-0.053 ppm / 53 ppb):** EPA annual standard
- **Good (53-100 ppb):** Approaching EPA 1-hour limit
- **Moderate (100-200 ppb):** EPA 1-hour standard (0.1 ppm)
- **Elevated (200-500 ppb):** Common kitchen peaks with gas stoves
- **Unhealthy (500-2000 ppb):** High kitchen peaks, health effects likely
- **Very Unhealthy (>2000 ppb):** Severe exposure, respiratory effects

### **Indoor Typical:**
- **Without gas appliances:** Half of outdoor levels
- **With gas appliances:** 25-75 ppb background, 200-4000 ppb kitchen peaks

**Key Standards:**
- EPA: 100 ppb (0.1 ppm) 1-hour, 53 ppb annual
- WHO: 200 µg/m³ 1-hour, 40 µg/m³ annual
- No agreed-upon indoor standards
- Gas stoves add 15-25 ppb to background
- Kitchen peaks: 200-1000 ppb common, can exceed 2000-4000 ppb

**Recommended Time Range:** 6-24 hours to capture cooking spikes

**Visualization Notes:** Current reading is MODERATE/ELEVATED (above EPA annual standard). This is typical for homes with gas appliances. Add thresholds at 53 ppb and 100 ppb.

---

## **13. Atmospheric Pressure (DPS310)**

**Current Reading:** 985.6 hPa

**Recommended Y-Axis Range:** 980-1040 hPa (or 960-1060 hPa for wider range)

### **Pressure Ranges:**
- **Very Low (<980 hPa):** Strong low-pressure system
- **Low (980-1000 hPa):** Low pressure, often stormy weather
- **Normal (1000-1020 hPa):** Standard atmospheric pressure
- **High (1020-1040 hPa):** High pressure, fair weather
- **Very High (>1040 hPa):** Strong high-pressure system

**Standard Pressure:** 1013.25 hPa (sea level)

**Recommended Time Range:** 24-48 hours to observe weather patterns

**Visualization Notes:** Pressure is useful for weather prediction and altitude compensation for other sensors. Add reference line at 1013.25 hPa.

---

## **14. ESP Temperature (Internal Sensor)**

**Current Reading:** 34.1°C

**Recommended Y-Axis Range:** 20-60°C

### **Status Thresholds:**
- **Normal (20-45°C):** Typical ESP32 operating temperature
- **Warm (45-60°C):** Elevated but acceptable
- **Hot (60-75°C):** Concerning, check ventilation
- **Critical (>75°C):** Thermal throttling/damage risk

**Recommended Time Range:** 24 hours

**Visualization Notes:** This is a diagnostic sensor for the device itself. Current reading is NORMAL.

---

## **GENERAL VISUALIZATION RECOMMENDATIONS**

### **Default Time Ranges by Sensor Type:**

#### **Fast-changing sensors (6-hour default):**
- CO₂ (occupancy-dependent)
- NO₂ (cooking spikes)
- Ammonia (activity-dependent)
- Ethanol (activity-dependent)

#### **Moderate sensors (24-hour default):**
- PM2.5, PM10
- Temperature
- Humidity
- VOC
- CO

#### **Slow sensors (24-48 hour default):**
- Atmospheric pressure

#### **Leak detection sensors (continuous/real-time):**
- Methane
- Hydrogen

### **Color Coding Scheme:**

- **Green:** Excellent/Good (healthy levels)
- **Yellow:** Moderate/Acceptable (minor concern)
- **Orange:** Elevated/Unhealthy (action recommended)
- **Red:** Poor/Dangerous (immediate action required)

### **Priority Sensors for Health Monitoring:**

#### **Primary Health Indicators:**
- CO₂ (ventilation indicator)
- PM2.5 (respiratory health)
- CO (acute toxicity)

#### **Secondary Health Indicators:**
- VOC (chemical exposure)
- Temperature & Humidity (comfort)
- NO₂ (respiratory irritant)

#### **Safety/Leak Detection:**
- Methane (explosion hazard)
- Hydrogen (if applicable)

#### **Supporting Data:**
- Atmospheric pressure (sensor calibration)
- ESP temperature (device health)

---

## **CURRENT SENSOR STATUS SUMMARY**

Based on the current readings from your Apollo AIR-1:

| Sensor | Reading | Status | Notes |
|--------|---------|--------|-------|
| CO₂ | 821 ppm | **GOOD** | Slightly elevated but acceptable; near 800 ppm threshold |
| PM <1µm | 1.2 µg/m³ | **EXCELLENT** | Well below WHO guideline (5 µg/m³) |
| PM <2.5µm | 1.3 µg/m³ | **EXCELLENT** | Well below WHO guideline (5 µg/m³) |
| PM <4µm | 1.3 µg/m³ | **EXCELLENT** | Very low particulate levels |
| PM <10µm | 1.3 µg/m³ | **EXCELLENT** | Well below WHO guideline (15 µg/m³) |
| VOC Index | 21 | **EXCELLENT** | Much cleaner than average baseline (100) |
| NOx Index | 2 | **EXCELLENT** | Much cleaner than average baseline (100) |
| Temperature | 22.3°C | **OPTIMAL** | Within ASHRAE comfort zone |
| Humidity | 42.7% | **OPTIMAL** | Within ASHRAE recommended range (30-60%) |
| CO | 4.47 ppm | **GOOD** | Typical for gas appliances; below 9 ppm limit |
| Methane | 0.00 ppm | **EXCELLENT** | No detectable methane |
| Ethanol | 1.65 ppm | **NORMAL** | Typical indoor level from occupancy |
| Hydrogen | 0.00 ppm | **EXCELLENT** | No detectable hydrogen |
| Ammonia | 1.14 ppm | **GOOD** | Approaching odor threshold (1.5 ppm) |
| NO₂ | 0.17 ppm | **MODERATE** | Above EPA annual standard; typical with gas appliances |
| Pressure | 985.6 hPa | **LOW** | Low pressure system (weather indicator) |
| ESP Temp | 34.1°C | **NORMAL** | Typical ESP32 operating temperature |

### **Overall Air Quality Assessment:**
Your indoor air quality is **EXCELLENT** overall. The only elevated readings are:
- CO₂ at 821 ppm (good but consider ventilation if rising)
- NO₂ at 170 ppb (typical for homes with gas appliances)
- CO at 4.47 ppm (acceptable but slightly elevated)

All particulate matter readings are exceptionally low, and VOC/NOx indices indicate very clean air.

---

## **REFERENCES**

- ASHRAE Standard 55-2017 (Thermal Environmental Conditions)
- ASHRAE Standard 62.1 (Ventilation for Acceptable Indoor Air Quality)
- EPA National Ambient Air Quality Standards (NAAQS)
- WHO Guidelines for Indoor Air Quality: Selected Pollutants
- OSHA/NIOSH Occupational Exposure Limits
- EPA Air Quality Index (AQI)
- European Indoor Air Quality Standards

---

*Report Generated: 2025-11-01*
*Device: Apollo AIR-1 Dashboard*
