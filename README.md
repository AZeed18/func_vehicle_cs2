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
> - Set parents of entities as needed

|Entity|Description|Required Properties|
|------|-----------|----------|
|`point_script`|To load the script|cs_script: the script|

## Vehicle

|Entity|Description|Required Properties|
|------|-----------|----------|
|Any VPhysics entity|Vehicle body|Name: `body`|
|`phys_thruster` (optional)|Thrusters to move the vehicle, one for forward/backward and one for right/left|Name: `forward\|right`|

## Vehicle seats

|Entity|Description|Required Properties|
|------|-----------|----------|
|`func_button`|Used to enter vehicle into that seat, each seat should have a number where seat 0 is the driver's seat|Name: `seat{seat number}_button`|
|Any|Entity whose origin is at the bottom of where the player should be when occupying that seat|Name: `seat{seat number}_in`|
|Any|Entity whose origin is at the bottom of where the player should be when unoccupying that seat|Name: `seat{seat number}_out`|
|`logic_collision_pair`|Used to disable collision between occupant and vehicle|Name: `seat{seat number}_collision`<br>Attachment 1: `seat{seat number}_player`<br>Attachment 2: `body`<br>Include Hierarchy: ✅||
|`logic_collision_pair` (optional)|Used to disable collision between driver seat occupant and the world, needed only for driver seats where the driver can get inside the ground|Name: `seat0_collision`<br>Attachment 1: `seat0_player`<br>Attachment 2: leave empty<br>Include Hierarchy: ✅||

# Limitations

- Requires placing `logic_collision_pair`
- [ ] Vehicle collision doesn't damage player
- [ ] Player orientation doesn't follow vehicle pitch and roll, so player can appear out of vehicle if it tilts or rotates up or down
- [ ] Weapon spread
- [x] All vehicles can rotate with same torque at any velocity
- [x] Can't drive on a seat that goes through the ground
