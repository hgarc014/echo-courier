# Echo Courier

**Echo Courier** is a temporal-logistics puzzle game built purely in Vanilla Javascript and HTML5 Canvas. You play as Courier 83-A, an underpaid delivery worker for the monolithic megacorporation **ChronoHaul**. To meet impossibly tight delivery quotas, you must utilize experimental looping technology to clone your past actions and cooperate with your own time-remnants ("Echoes"). 

However, as the routes get deeper into the Anomaly Sector, the ChronoHaul infrastructure breaks down, hostile corporate surveillance goes rogue, and a hacker begins intercepting your encrypted comms.

---

## 🎮 Core Mechanics

At its heart, Echo Courier is a single-player co-op game. 
- **The Loop System:** You have a set amount of time to manipulate the environment. When you press `[R]` or fail a run, time rewinds. Your previous actions are saved and played back perfectly as a ghostly "Echo."
- **Cooperation:** You must hold doors open, block security components, or toss packages between your present self and your past Echoes to solve spatial puzzles.
- **The Grid:** The map operates on a deterministic 60-FPS physics loop containing interactable buttons, fragile cargo, and deadly security systems.

## ⚙️ The Economy & Upgrades

You earn **$50** for clearing a level, and an additional **$50** for beating its optional "Gold Star Challenge". Replaying levels yields $0, meaning your economy is strictly capped and you must carefully choose when and what to upgrade in the **Corp Terminal (Shop)**:

- **Dash Module ($150):** `[SHIFT]` Teleport 120px instantly. Bypasses wind and gaps. Leaves a hyperspeed trail.
- **Toss Protocol ($150):** `[F]` Throw a held package across chasms. It flies at 3x speed and ignores wind currents.
- **Cloak Generator ($200):** `[C]` Become temporarily invisible to cameras and lasers. (Note: Carrying Contraband forces alarms regardless of cloak).

### 👔 Corporate Rank and Suits
Earning more levels increases your Corporate Rank (from Junior Courier up to Loopmaster), which unlocks alternate Suit Colors (Neon Green, Corporate Purple, Elite White, and Gold) that you can equip in the terminal.

---

## 🏢 Campaign Log: The 13 Routes

### **Tutorial Sector: ChronoHaul Infrastructure**
1. **Level 1: The Basics**
   - **Story:** Dispatch berates you about 4% inefficiency and introduces the Echo Payload.
   - **Mechanic:** Drop a Ghost on a pressure plate to open a door for your present self.
2. **Level 2: The Airlock**
   - **Story:** The Hub Manager authorizes double-echo timelines to handle a broken airlock.
   - **Mechanic:** Coordinate 2 distinct Ghosts on two separate plates.
3. **Level 3: Heavy Lifting**
   - **Story:** You must deliver High-Density cargo that halves your physical walking speed.
   - **Mechanic:** Plan an extended, slow-paced route using a Timer Door.

### **The Outskirts: Broken Infrastructure**
4. **Level 4: Gap Bypass**
   - **Story:** The floor is collapsing. Dispatch suggests buying the Dash upgrade, otherwise you must sprint the collapsing cracks barefoot.
   - **Mechanic:** A complex gap puzzle where the door plate is guarded by a collapsing floor.
5. **Level 5: Fragile Handling**
   - **Story:** Class-4 Fragile tech will vaporize instantly if a laser touches it.
   - **Mechanic:** A dual-locked laser grid requiring precise Ghost synergy to escort the payload.
6. **Level 6: The Toss**
   - **Story:** The bridge is out. Toss Protocol recommended for air-delivery.
   - **Mechanic:** The delivery zone is surrounded by an impenetrable chasm. You must Toss the payload mid-air while an Echo holds the blast door open.
7. **Level 7: Wind Tunnel**
   - **Story:** Sector Surveillance warns of 80mph cross-winds pushing into disposal lasers.
   - **Mechanic:** A "Frogger" sequence. You must perfectly time horizontal Dash teleports to bypass deadly vertical wind-streams.

### **The Anomaly Sector: Sabotage**
8. **Level 8: The Panopticon**
   - **Story:** An encrypted Hacker reveals you are trafficking illegal temporal drives (Contraband). 
   - **Mechanic:** Sweeping security cameras trigger Alarms. Contraband renders your Cloak useless if exposed.
9. **Level 9: Noise Complaint**
   - **Story:** You are taught how to distract Rogue Security Drones using blue Decoy packages.
   - **Mechanic:** Drones react to the physical sound of dropping/tossing items. You must lure them off their patrol routes.
10. **Level 10: Fast Shipping**
    - **Story:** Dispatch quietly hands you a ticking bomb. 
    - **Mechanic:** The package has a strict 5-second detonation timer. Complete speed-routing.

### **The Core: Escape**
11. **Level 11: Time Dilation**
    - **Story:** The Hacker reveals ChronoHaul is trapping your discarded timelines in Static purple fields to harvest your temporal energy.
    - **Mechanic:** Static Zones cut Ghost playback speed exactly in half, instantly de-syncing your meticulously planned loops.
12. **Level 12: Echo Crunch**
    - **Story:** Temporal budget dry. One echo maximum. Zero margin for error. 
    - **Mechanic:** The ultimate physics exam.
13. **Level 13: Danger Courier (Boss Fight)**
    - **Story:** The Hacker warns that ChronoHaul has deployed an Exterminator Robot to silence you.
    - **Mechanic:** A 3-Phase combat sequence. You must dodge lasers, lure the robot, and Toss heavy packages directly into its chassis to crack its armor and unlock the final escape bulkhead.

---
*No external frameworks or libraries were used. Echo Courier runs natively on HTML5 Canvas.*
