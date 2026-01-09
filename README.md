> [!NOTE]
> Coming Soon

This is a CS2 cs_script to help create vehicles

# Map Setup

These entities must be placed in the map

> [!IMPORTANT]
> You must either include vehicle name prefix (i.e., `{vehicle name}_`) in the name of every entity or create a prefab containing vehicle entities and instead set the prefab name to vehicle name in Hammer

|Entity|Description|Required Properties|
|------|-----------|----------|
|`point_script`|To load the script|cs_script: the script|

## Vehicle

|Entity|Description|Required Properties|
|------|-----------|----------|
|Any VPhysics entity|Vehicle body|Name: `body`|
|`phys_thruster`|Thruster to move the vehicle, forward, backward, right and left... you can skip any or all thrusters|Name: `thruster_{forward/backward/right/left}`|

## Vehicle seats

|Entity|Description|Required Properties|
|------|-----------|----------|
|`func_button`|Used to enter vehicle into that seat, each seat should have a number where seat 0 is the driver's seat|Name: `seat{seat number}_button`|
|Any|Entity whose origin is at the bottom of where the player should be when occupying that seat|Name: `seat{seat number}_in`|
|Any|Entity whose origin is at the bottom of where the player should be when unoccupying that seat|Name: `seat{seat number}_out`|
|`logic_collision_pair`|Used to disable collision between vehicle body and occupant|Name: `seat{seat number}_collision`<br>Attachment 1: `body`<br>Attachment 2: `seat{seat number}_player`<br>Include Hierarchy: ✅<br>Start with collisions disabled: ✅||

# Limitations/Todo

- Requires placing `logic_collision_pair`
- Vehicle collision doesn't damage player
