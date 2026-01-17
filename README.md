https://github.com/user-attachments/assets/8119030e-958b-4ef8-9056-ed79003c067c

This is a CS2 cs_script to help create vehicles with minimal map setup

A demo map with a vehicle is in maps folder

# Features

- Player follow the vehicle almost smoothly
- You can create vehicles without any entity I/O
- You can have as many seats and place them where you want
- You can choose to ignore thruster of one or more directions

# Map Setup

These entities must be placed in the map

> [!IMPORTANT]
> - You must either include vehicle name prefix (i.e., `{vehicle name}_`) in the name of every vehicle/seat-specific entity or create a prefab containing vehicle entities and instead set the prefab name to vehicle name in Hammer
> - Remember to set parents of entities as needed

- `point_script`: To load the script
    > cs_script: the script
- `logic_collision_pair`: Used to disable collision between vehicle and occupants, you may place one for each vehicle or use wildcards to match multiple/all vehicles
    > Name: `func_vehicle_collision`\
    > Attachment 1: `func_vehicle_player`\
    > Attachment 2: vehicle body/bodies name/pattern\
    > Support multiple entities with same name: ✅\
    > Include Hierarchy: ✅
- `logic_collision_pair` (optional): Used to disable collision between occupant and the world, needed to enable driving inside the ground.. Optional for vehicles where the driver seat can't get inside the ground
    > Name: `func_vehicle_collision`\
    > Attachment 1: `func_vehicle_player`\
    > Attachment 2: *empty*\
    > Support multiple entities with same name: ✅\
    > Include Hierarchy: ✅
- `func_brush`: Used as a floor for seats
    > Brush: a 32x32 (maybe less is needed) face with material `tools/playerclip` or `tools/clip`
    > Solidity: Always Solid
- `point_template`: Used to dynamically spawn seat floors
    > Name: `func_vehicle_template`
    > Template: seat floor entity (see above)

## Vehicle

- Any VPhysics entity: Vehicle body
    > Name: `body`
- `phys_thruster` (optional): Used to move the vehicle forward/backward
    > Name: `forward`
    > Apply Torque: ❌
- `phys_torque` (optional): Used to move the vehicle right/left
    > Name: `right`

## Seats

- `func_button`: Used to enter vehicle into that seat, each seat should have a number where seat 0 is the driver's seat
    > Name: `seat{seat number}_button`
- Any entity: Entity whose origin is at the bottom of where the player should be when occupying that seat
    > Name: `seat{seat number}_in`
- Any entity: Entity whose origin is at the bottom of where the player should be when unoccupying that seat
    > Name: `seat{seat number}_out`

# Current Limitations

- Vehicle will immediately stop on touching any non-occupant player
- Vehicle collision doesn't damage occupants
- Driver orientation doesn't follow vehicle pitch and roll unless vehicle is considered undrivable due to its orientation being at specific roll and/or pitch, so driver can appear out of vehicle if it tilts or rotates up or down
- ~~Weapon spread~~
- ~~All vehicles can rotate with same torque at any velocity~~
- ~~Can't drive on a seat that goes through the ground~~
