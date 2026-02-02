https://github.com/user-attachments/assets/8119030e-958b-4ef8-9056-ed79003c067c

This is a CS2 cs_script to help create vehicles with minimal map setup

A demo map with a vehicle is in maps folder

# Features

- You can create vehicles without any entity I/O
- You can have as many seats and place them where you want
- You can choose to ignore thruster of one or more directions
- Support for wheeled vehicles
- Support for steering wheels and similar
- Player is forced out of vehicle if another player tries to enter
- API

# Map Setup

These entities must be placed in the map

> [!IMPORTANT]
> - You must either include a vehicle-specific prefix (i.e., `{vehicle name}_`) in the name of every vehicle/seat-specific entity or create a prefab containing all such entities without prefixes
> - Remember to set parents of entities as needed

- `point_script`: To load the script
    |Property|Value|
    |---|---|
    |cs_script|`scripts/vscripts/func_vehicle.vjs`|
- `logic_collision_pair`: Used to disable collisions between vehicle and occupants, you may place one for each vehicle or use wildcards to match multiple/all vehicles
    |Property|Value|
    |---|---|
    |Attachment 1|vehicle body name/pattern|
    |Support multiple entities with same name|✅ (if using a pattern)|
    |Include Hierarchy|✅|
    |Start with collisions disabled|✅|
- `logic_collision_pair`: Used to disable collisions between occupant and the world, needed to enable driving inside the ground... Not needed if driver seat can't get inside the ground in any vehicle
    |Property|Value|
    |---|---|
    |Attachment 1|*empty*|
    |Include Hierarchy|✅|
    |Start with collisions disabled|✅|
- `func_tracktrain`: Used as a floor for seats to prevent weapon spread
    |Property|Value|
    |---|---|
    |Name|`func_vehicle_floor`|
    |Brush|a 32x32 (maybe less is needed) face with material `tools/playerclip`|
    |Solidity|Always Solid|
- `point_template`: Used to dynamically spawn seat floors and collision pair entities
    |Property|Value|
    |---|---|
    |Name|`func_vehicle_template`|
    |Template 1|seat floor entity|
    |Template 2...|collision pair entities|

### Wheels

- `logic_collision_pair`: Used to disable collisions between occupant and vehicle wheels
    |Property|Value|
    |---|---|
    |Attachment 1|vehicle wheel name/pattern|
    |Support multiple entities with same name|✅ (if using a pattern)|
    |Include Hierarchy|✅|
    |Start with collisions disabled|✅|

## Vehicle

- Any VPhysics entity: Vehicle body
    |Property|Value|
    |---|---|
    |Name|`body`|
- `phys_thruster`/`phys_torque` (optional): Used to move the vehicle forward/backward
    |Property|Value|
    |---|---|
    |Name|`forward`|
- `phys_thruster`/`phys_torque` (optional): Used to move the vehicle right/left
    |Property|Value|
    |---|---|
    |Name|`right`|

### Information Entities

Entities used to provide vehicle- and seat-specific information to the script

#### Steering

You can add any number of entities you want or none that rotate around their axes on steering, this is necessary for tires and can allow for other entities like steering wheels

|Property|Value|
|---|---|
|Name|`steer`|
|Parent|steering entity|
|Angles|same as steering entity + deviation on steering right|

### Wheels

- Any VPhysics entity: Wheels
- `func_tracktrain` (optional): Used as an angular constraint anchor for steering wheels to steer
    |Property|Value|
    |---|---|
    |Name|[see here](#steering)|
    |Parent|vehicle body|
    |Spawnflags|passable|
    |Brush|anything with any invisible texture|
- Any angular constraint: Used to constarint steering wheels to angular anchor, only constraint x-axis and z-axis amgular motion
    |Property|Value|
    |---|---|
    |Attachment 1|angular anchor|
    |Attachment 2|wheels|
    |Treat Entity 1 as Infinite Mass|✅|
    |No Collision Until Break|✅|
- Any linear constraint: Used to constarint steering wheels to angular anchor, constraint all linear motion and set no collision until break
- `phys_hinge` (optional): Used to constarint non-steering wheels to vehicle body, set hinge axis to wheel's side and set no collision until break
- `logic_collision_pair` (optional): Used to disable collisions between vehicle wheels and body hierarchies
    |Property|Value|
    |---|---|
    |Attachment 1|vehicle body|
    |Attachment 2|vehicle wheel(s) name/pattern|
    |Support multiple entities with same name|✅|
    |Include Hierarchy|✅|

## Seats

- `func_button`: Used to enter vehicle into that seat, each seat should have a number where seat 0 is the driver's seat
    |Property|Value|
    |---|---|
    |Name|`seat{seat number}_button`|
- Any entity: Entity whose origin is at the bottom of where the player should be when occupying that seat
    |Property|Value|
    |---|---|
    |Name|`seat{seat number}_in`|
- Any entity (optional): Entity whose origin is at the bottom of where the player should be when unoccupying that seat
    |Property|Value|
    |---|---|
    |Name|`seat{seat number}_out`|

# API

- `OnUser1` is fired at `seat*_in` on entering, activator is the player
- `OnUser2` is fired at `seat*_in` on exiting, activator is the player

# Current Limitations

- Vehicle will immediately slow down on touching any non-occupant player
- ~~Vehicle collision doesn't damage occupants~~
- Driver orientation doesn't follow vehicle pitch and roll unless vehicle is considered undrivable due to its orientation being at specific roll and/or pitch, so driver can appear out of vehicle
- Driver doesn't follow the vehicle smoothly unless vehicle is considered undrivable
- ~~Weapon spread~~
- ~~All vehicles can rotate with same torque at any velocity~~
- ~~Can't drive on a seat that goes through the ground~~
