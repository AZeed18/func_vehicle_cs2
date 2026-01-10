import { Instance as i } from "cs_script/point_script";

const ZEROVECTOR = {x:0, y:0, z:0};
const DEVIATION = 30; // how much degrees allowed to deviate from known directions as error caused by player rotating while moving, must be < 45
const occupiedVecs = new Map(); // map of occupied vehicle entities to dictionary of vehicle data
const newOccupants = []; // temporary list of player entity and seat name for every new occupant
const newAbandoners = [];  // temporary list of player entity for every new abandoner

// occupy seat or occupy new vehicle if unoccupied
function EnterVehicle(ply, vec, seatNum){
	const vecData = occupiedVecs.get(vec);

	if (vecData != undefined)
		vecData.occupants[seatNum] = ply;
	else
		occupiedVecs.set(vec, {
			occupants: {[seatNum]: ply}, // seat occupants, e.g., {0: ply1}, {0: ply2, 2: ply3}
			hp: 1, // health from 0 to 1
			hpConnID: i.ConnectOutput(vec, "OnHealthChanged", UpdateOccupantsHealth) // hpConnID: vehicle body connection ID for the connection that damages occupants with the vehicle
		});

	// rename player to match name in his seat's logic_collision_pair
	ply.SetEntityName(seatName + '_player');

	// queue player to disable its collisions with the vehicle on the next OnThink call
	const vecName = vec.GetEntityName();
	const seatName = vecName + '_seat' + seatNum;
	newOccupants.push([ply, seatName]);
}

function ExitVehicle(ply, vec, seatNum){
	const vecData = occupiedVecs.get(vec);
	delete vecData.occupants[seatNum];

	// if all seats empty, remove from occupied vehicles
	if (Object.keys(vecData.occupants).length === 0){
		i.DisconnectOutput(occupiedVecs.get(vec).hpConnID);
		occupiedVecs.delete(vec);
	}

	// stop all thrusters
	const vecName = vec.GetEntityName().replace('_body', '');
	SetThrusterState(vecName, 'forward', false);
	SetThrusterState(vecName, 'backward', false);
	SetThrusterState(vecName, 'right', false);
	SetThrusterState(vecName, 'left', false);

	const seatName = vecName + '_seat' + seatNum;
	i.EntFireAtName({name: seatName + '_collision', input: "EnableCollisions"});

	// queue player to reset its name on the next OnThink call
	const ply = vecData.occupants[seatNum];
	newAbandoners.push(ply);

	// teleport out of seat
	if (ply){
		const seatOut = i.FindEntityByName(seatName + '_out');
		const seatOutAngles = seatOut.GetAbsAngles();
		seatOutAngles.roll = 0;
		ply.Teleport(seatOut.GetAbsOrigin(), seatOutAngles, ZEROVECTOR);
	}
}

function GetOccupant(vec, seatNum){
	const vecData = occupiedVecs.get(vec);
	if (vecData != undefined)
		return vecData.occupants[seatNum]
}

function GetPlayerVehicle(ply){
	for (const [vec, vecData] of occupiedVecs)
		for (const seatNum in vecData.occupants)
			if (vecData.occupants[seatNum] === ply)
				return [vec, seatNum];
}

function IsInVehicle(ply){
	return GetPlayerVehicle(ply) != undefined;
}

function UseVehicle(inputData){
	const [seatButton, ply] = [inputData.caller, inputData.activator];

	const vec = i.FindEntityByName(vecName + '_body');
	const seatNum = Number(seatButton.replace(/.*_seat\d+_button/, ''));

	const occupant = GetOccupant(vec, seatNum);
	// not occupied and player is not in a vehicle
	if (occupant == undefined && ! IsInVehicle(ply))
		EnterVehicle(ply, vec, seatNum);
	// already occupied but by same player, then he meant to exit
	else if (occupant === ply)
		ExitVehicle(ply, vec, seatNum);
}

function UpdateOccupantsHealth(inputData){
	const [newHp, vec, damageSrc] = [inputData.value, inputData.caller, inputData.activator];
	const vecData = occupiedVecs.get(vec);
	const oldHp = vecData.hp;

	// TODO

	vecData.hp = newHp;
}

function SetThrusterState(vecName, direction, on){
	const thruster = i.FindEntityByName(vecName + '_thruster_' + direction);
	if (thruster != undefined){
		if (on)
			i.EntFireAtTarget({target: thruster, input: "Activate"});
		else
			i.EntFireAtTarget({target: thruster, input: "Deactivate"});
	}
}

// --------------------

i.OnRoundStart(() => {
	occupiedVecs.clear();
	for (const seatButton of i.FindEntitiesByName("*_seat*_button"))
		i.ConnectOutput(seatButton, "OnPressed", UseVehicle);
});

i.OnPlayerKill((ev) => {
	const ret = GetPlayerVehicle(ev.player);
	if (ret == undefined) return;
	const [vec, seatNum] = ret;
	ExitVehicle(ev.player, vec, seatNum);
});

i.OnPlayerDisconnect((_) => {
	for (const [vec, vecData] of occupiedVecs)
		for (const seatNum in vecData.occupants)
			if (vecData.occupants[seatNum].GetPlayerController() == undefined)
				return ExitVehicle(null, vec, seatNum);
});

// --------------------

i.SetThink(() => {
	while (newOccupants.length){
		const [ply, seatName] = newOccupants.pop();
		i.EntFireAtName({name: seatName + '_collision' , input: "DisableCollisions"});
		
		const seatIn = i.FindEntityByName(seatName + '_in');
		ply.Teleport(seatIn.GetAbsOrigin(), seatIn.GetAbsAngles(), ZEROVECTOR);
	}

	while (newAbandoners.length)
		newAbandoners.pop().SetEntityName('');

	for (const [vec, vecData] of occupiedVecs){
		const vecName = vec.GetEntityName().replace('_body', '');
		for (const seatNum in vecData.occupants){
			const ply = vecData.occupants[seatNum];

			// if driver, detect his movement direction to move vehicle before teleporting him
			if (seatNum == 0){
				// stop all thrusters
				SetThrusterState(vecName, 'forward', false);
				SetThrusterState(vecName, 'backward', false);
				SetThrusterState(vecName, 'right', false);
				SetThrusterState(vecName, 'left', false);

				// get driver veolcity vector
				const velVec = ply.GetAbsVelocity();

				// calculate velocity
				const vel = Math.sqrt(velVec.x**2 + velVec.y**2);
				
				// if driver moved, move the vehicle
				if (vel > 0){
					const drvAngles = ply.GetAbsAngles();

					// calculate normalized velocity vector (i.e., direction vector)
					const dirx = velVec.x/vel;
					const diry = velVec.y/vel;

					// calculate the yaw of direction vector
					const velYaw = Math.atan2(diry, dirx) / Math.PI * 180;

					// determine movement direction relative to driver's direction to activate the right thruster(s) (https://developer.valvesoftware.com/wiki/QAngle)
					const dyaw = -(velYaw - drvAngles.yaw) // negative to make right at 90 instead of -90
					if (dyaw < 0) dyaw += 360;
					// forward
					if ((dyaw > 0 && dyaw < 0 + DEVIATION) || (dyaw > 360 - DEVIATION && dyaw < 360))
						SetThrusterState(vecName, 'forward', true);
					// backward
					else if (dyaw > 180 - DEVIATION && dyaw < 180 + DEVIATION)
						SetThrusterState(vecName, 'backward', true);
					// right
					else if (dyaw > 90 - DEVIATION && dyaw < 90 + DEVIATION)
						SetThrusterState(vecName, 'right', true);
					// left
					else if (dyaw > 270 - DEVIATION && dyaw < 270 + DEVIATION)
						SetThrusterState(vecName, 'left', true);
					// forward right
					else if (dyaw > 45 - DEVIATION && dyaw < 45 + DEVIATION){
						SetThrusterState(vecName, 'forward', true);
						SetThrusterState(vecName, 'right', true);
					}
					// forward left
					else if (dyaw > 315 - DEVIATION && dyaw < 315 + DEVIATION){
						SetThrusterState(vecName, 'forward', true);
						SetThrusterState(vecName, 'left', true);
					}
					// backward right
					else if (dyaw > 135 - DEVIATION && dyaw < 135 + DEVIATION){
						SetThrusterState(vecName, 'backward', true);
						SetThrusterState(vecName, 'right', true);
					}
					// backward left
					else if	(dyaw > 225 - DEVIATION && dyaw < 225 + DEVIATION){
						SetThrusterState(vecName, 'backward', true);
						SetThrusterState(vecName, 'left', true);
					}
				}
			}

			const seatIn = i.FindEntityByName(vecName + '_seat' + seatNum + '_in');
			const seatInAngles = seatIn.GetAbsAngles();
			// if pitch or roll > 45, player exits vehicle
			if (Math.abs(seatInAngles.pitch) > 45 || Math.abs(seatInAngles.roll) > 45)
				ExitVehicle(ply, vec, seatNum);
			// teleport occupant to his seat
			else
				ply.Teleport(seatIn.GetAbsOrigin(), null, ZEROVECTOR);
		}
	}
	i.SetNextThink(i.GetGameTime());
});
i.SetNextThink(i.GetGameTime());
