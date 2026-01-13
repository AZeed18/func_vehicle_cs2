import { Instance as i } from "cs_script/point_script";

const ZEROVECTOR = {x:0, y:0, z:0};
const DEVIATION = 30; // how much degrees allowed to deviate from known directions as error caused by player rotating while moving, must be < 45
const FULLTORQUEVELOCITY = 300; // velocity at which vehicle reaches maximum torque
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
	const vecName = vec.GetEntityName().replace('_body', '');
	const seatName = vecName + '_seat' + seatNum;
	ply.SetEntityName(seatName + '_player');

	// queue player to disable its collisions with the vehicle on the next OnThink call
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
	SetThrusterState(vecName, 'right', false);

	const seatName = vecName + '_seat' + seatNum;
	i.EntFireAtName({name: seatName + '_collision', input: "EnableCollisions"});

	// queue player to reset its name on the next OnThink call
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

	const vecName = seatButton.GetEntityName().replace(/_seat\d+_button/, '');
	const vec = i.FindEntityByName(vecName + '_body');
	const seatNum = seatButton.GetEntityName().replace(/.*_seat(\d+)_button/, '$1');

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

function SetThrusterState(vecName, direction, on, forceScale=1){
	const thruster = i.FindEntityByName(vecName + '_' + direction);

	if (thruster != undefined){
		i.EntFireAtTarget({target: thruster, input: "Scale", value: forceScale});
		if (on)
			i.EntFireAtTarget({target: thruster, input: "Activate"});
		else
			i.EntFireAtTarget({target: thruster, input: "Deactivate"});
	}
}

// --------------------

i.OnRoundStart(() => {
	// reset player names from last round
	for (const [_, vecData] of occupiedVecs)
		for (const seatNum in vecData.occupants)
			vecData.occupants[seatNum].SetEntityName('');

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

function magnitude(v){
	return Math.sqrt(v.x**2 + v.y**2 + v.z**2);
}

// find yaw of a vector
function findYaw(v){
	v.z = 0;

	const m = magnitude(v);

	// calculate normalized velocity vector (i.e., direction vector)
	const d = {
		x: v.x/=m,
		y: v.y/=m
	}

	// calculate the yaw of direction vector
	return Math.atan2(d.y, d.x) / Math.PI * 180;
}

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
				SetThrusterState(vecName, 'right', false);

				// get driver velocity
				const drvVelVec = ply.GetAbsVelocity();

				// if driver moved, move the vehicle
				if (drvVelVec.x != 0 || drvVelVec.y != 0){
					// find driver movement yaw relative to his yaw
					const drvYaw = ply.GetAbsAngles().yaw;
					const drvVelYaw = findYaw(drvVelVec);
					const drvRelYaw = (drvVelYaw - drvYaw + 360) % 360;

					// calculate torque scale
					const vecVelVec = vec.GetAbsVelocity();
					vecVelVec.z = 0;
					const vecVel = magnitude(vecVelVec);
					const scale = Math.min(vecVel/FULLTORQUEVELOCITY, 1);

					// find vehicle movement yaw relative to its yaw
					const vecYaw = vec.GetAbsAngles().yaw;
					const vecVelYaw = findYaw(vecVelVec);
					const vecRelYaw = vecVelYaw - vecYaw;
					const forward = Math.cos(vecRelYaw / 180 * Math.PI) > 0

					// determine movement direction relative to driver's direction to activate the right thruster(s) (https://developer.valvesoftware.com/wiki/QAngle)
					// forward
					if ((drvRelYaw > 0 && drvRelYaw < 0 + DEVIATION) || (drvRelYaw > 360 - DEVIATION && drvRelYaw < 360))
						SetThrusterState(vecName, 'forward', true);
					// backward
					else if (drvRelYaw > 180 - DEVIATION && drvRelYaw < 180 + DEVIATION)
						SetThrusterState(vecName, 'forward', true, -1);
					// left
					else if (drvRelYaw > 90 - DEVIATION && drvRelYaw < 90 + DEVIATION)
						SetThrusterState(vecName, 'right', true, forward ? -scale : scale);
					// right
					else if (drvRelYaw > 270 - DEVIATION && drvRelYaw < 270 + DEVIATION)
						SetThrusterState(vecName, 'right', true, forward ? scale : -scale);
					// forward left
					else if (drvRelYaw > 45 - DEVIATION && drvRelYaw < 45 + DEVIATION){
						SetThrusterState(vecName, 'right', true, forward ? -scale : scale);
						SetThrusterState(vecName, 'forward', true, 1);
					}
					// forward right
					else if (drvRelYaw > 315 - DEVIATION && drvRelYaw < 315 + DEVIATION){
						SetThrusterState(vecName, 'right', true, forward ? scale : -scale);
						SetThrusterState(vecName, 'forward', true, 1);
					}
					// backward left
					else if (drvRelYaw > 135 - DEVIATION && drvRelYaw < 135 + DEVIATION){
						SetThrusterState(vecName, 'right', true, forward ? -scale : scale);
						SetThrusterState(vecName, 'forward', true, -1);
					}
					// backward right
					else if	(drvRelYaw > 225 - DEVIATION && drvRelYaw < 225 + DEVIATION){
						SetThrusterState(vecName, 'right', true, forward ? scale : -scale);
						SetThrusterState(vecName, 'forward', true, -1);
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
