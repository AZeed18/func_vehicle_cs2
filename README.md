> [!NOTE]
> Coming Soon

# Requirements

These entities must be placed for each vehicle in the map

> [!IMPORTANT]
> You must either include vehicle name prefix (i.e., `{vehicle name}_`) in the name of every entity or create a prefab containing vehicle entities and instead set the prefab name to vehicle name in Hammer

|Entity|Description|Required Properties|
|------|-----------|----------|
|Any VPhysics entity|Vehicle body|Name: `body`|
|`phys_thruster`|Thruster to move the vehicle, forward, backward, right and left... you can skip any or all thrusters|Name: `thruster_{forward/backward/right/left}`|

## For each seat:

|Entity|Description|Required Properties|
|------|-----------|----------|
|`func_button`|Used to enter vehicle into that seat, each seat should have a number where seat 0 is the driver's seat|Name: `seat{seat number}_button`|
|Any|Entity whose origin is at the bottom of where the player should be when occupying that seat|Name: `seat{seat number}_in`|
|Any|Entity whose origin is at the bottom of where the player should be when unoccupying that seat|Name: `seat{seat number}_out`|
|`logic_collision_pair`|Used to disable collision between vehicle body and occupant|Name: `seat{seat number}_collision`<br>Attachment 1: `body`<br>Attachment 2: `seat{seat number}_player`||

# Limitations/Todo

- Requires placing `logic_collision_pair`
- Vehicle collision doesn't damage player
