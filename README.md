https://github.com/user-attachments/assets/8119030e-958b-4ef8-9056-ed79003c067c

This is a CS2 cs_script to help create vehicles with minimal map setup

A demo map with a vehicle is in maps folder

# Features

- Player follow the vehicle almost smoothly
- You can create vehicles without any entity I/O
- You can have as many seats and place them where you want
- You can choose to ignore thruster of one or more directions
- Support for wheeled vehicles

# Map Setup

These entities must be placed in the map

> [!IMPORTANT]
> - You must either include a vehicle-specific prefix (i.e., `{vehicle name}_`) in the name of every vehicle/seat-specific entity or create a prefab containing all such entities without prefixes
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
- `func_tracktrain`: Used as a floor for seats
    > Brush: a 32x32 (maybe less is needed) face with material `tools/playerclip`\
    > Solidity: Always Solid
- `point_template`: Used to dynamically spawn seat floors
    > Name: `func_vehicle_template`\
    > Template: seat floor entity

## Vehicle

- Any VPhysics entity: Vehicle body
    > Name: `body`
- `phys_thruster`/`phys_torque` (optional): Used to move the vehicle forward/backward
    > Name: `forward`\
    > Apply Torque: ❌
- `phys_thruster`/`phys_torque` (optional): Used to move the vehicle right/left
    > Name: `right`

### Wheels

- Any VPhysics entity: Wheels
- `func_tracktrain` (optional): Used to steer
    > Name: `wheels_angular_anchor`\
    > Parent: vehicle body\
    > Spawnflags: passable\
    > Brush: anything with any invisible texture
- Any angular constraint: Used to constarint steering wheels to angular anchor, only constraint x-axis and z-axis amgular motion
    > Attachment 1: `wheels_angular_anchor`\
    > Attachment 2: wheels\
    > Treat Entity 1 as Infinite Mass: ✅
- Any linear constraint: Used to constarint steering wheels to angular anchor, constraint all linear motion
- `phys_hinge` (optional): Used to constarint non-steering wheels to vehicle body, set hinge axis to wheel's side

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
