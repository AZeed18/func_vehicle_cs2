import { Instance as i } from "cs_script/point_script";

const ZEROVECTOR = {x:0, y:0, z:0};

/**
 * How much degrees allowed to deviate from known directions as error caused by player rotating while moving
 * 
 * Must be < 45
 */
const DEVIATION = 22.5;

/**
 * Velocity at which the vehicle reaches maximum torque
 */
const FULLTORQUEVELOCITY = 300;

/**
 * Map of occupied vehicle entities to dictionaries of their data
 */
const occupiedVecs = new Map();

/**
 * Queue of [player entity, vehicle entity, seat number] for every new occupant
 * 
 * Used to continue vehicle occupation on the next OnThink call
 */
const newOccupantsQueue = [];

/**
 * Queue of player entity for every new abandoner
 * 
 * Used to continue vehicle abandonment on the next OnThink call
 */
const newAbandonersQueue = [];

function setThrusterState(vecName, direction, on, forceScale=1){
	const thruster = i.FindEntityByName(vecName + '_' + direction);

	if (thruster != undefined){
		i.EntFireAtTarget({target: thruster, input: "Scale", value: forceScale});
		if (on)
			i.EntFireAtTarget({target: thruster, input: "Activate"});
		else
			i.EntFireAtTarget({target: thruster, input: "Deactivate"});
	}
}

function magnitude(v){
	return Math.sqrt(v.x**2 + v.y**2 + v.z**2);
}

/**
 * Find yaw of a vector
 */
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

/**
 * Occupy seat or occupy new vehicle if vehicle is unoccupied
 */
function enterVehicle(ply, vec, seatNum){
	const vecData = occupiedVecs.get(vec);

	if (vecData != undefined)
		vecData.occupants[seatNum] = ply;
	else
		occupiedVecs.set(vec, {
			occupants: {[seatNum]: ply}, // seat occupants, e.g., {0: ply1}, {0: ply2, 2: ply3}
			hp: 1, // health from 0 to 1
			hpConnID: i.ConnectOutput(vec, "OnHealthChanged", updateOccupantsHealth) // hpConnID: vehicle body connection ID for the connection that damages occupants with the vehicle
		});

	// spawn seat floor
	const template = i.FindEntityByName('func_vehicle_template');
	const floor = template.ForceSpawn()[0];

	// rename seat floor
	const vecName = vec.GetEntityName().replace('_body', '');
	const seatName = vecName + '_seat' + seatNum;
	floor.SetEntityName(seatName + '_floor');

	// enable collisions
	ply.SetEntityName('func_vehicle_player');
	i.EntFireAtName({name: 'func_vehicle_collision', input: 'DisableCollisions'});
	newOccupantsQueue.push([ply, vec, seatNum]);
}

function exitVehicle(vec, seatNum, teleport=true){
	const vecData = occupiedVecs.get(vec);
	const ply = vecData.occupants[seatNum];
	delete vecData.occupants[seatNum];

	// if all seats empty, remove from occupied vehicles
	if (Object.keys(vecData.occupants).length === 0){
		i.DisconnectOutput(occupiedVecs.get(vec).hpConnID);
		occupiedVecs.delete(vec);
	}

	// remove seat floor
	const vecName = vec.GetEntityName().replace('_body', '');
	const seatName = vecName + '_seat' + seatNum;
	const floor = i.FindEntityByName(seatName + '_floor');
	floor.Remove();

	// if player is not exiting because of disconnection
	if (ply.GetPlayerController() != undefined){
		if (teleport) teleportToSeat(ply, vec, seatNum, true);

		ply.SetParent(null);

		// enable collisions
		ply.SetEntityName('func_vehicle_player');
		i.EntFireAtName({name: 'func_vehicle_collision', input: 'EnableCollisions'});
		newAbandonersQueue.push(ply);
		
		if (seatNum == 0){
			// stop thrusters
			setThrusterState(vecName, 'forward', false);
			setThrusterState(vecName, 'right', false);
		}
	}
}

function getOccupant(vec, seatNum){
	const vecData = occupiedVecs.get(vec);
	if (vecData != undefined)
		return vecData.occupants[seatNum]
}

function getPlayerVehicle(ply){
	for (const [vec, vecData] of occupiedVecs)
		for (const seatNum in vecData.occupants)
			if (vecData.occupants[seatNum] === ply)
				return [vec, seatNum];
	return [null, null];
}

function inVehicle(ply){
	return getPlayerVehicle(ply)[0] !== null;
}

// --------------------
// Callbacks
// --------------------

i.OnRoundStart(() => {
	occupiedVecs.clear();

	while (newOccupantsQueue.length)
		newOccupantsQueue.pop()[0].SetEntityName('');

	while (newAbandonersQueue.length)
		newAbandonersQueue.pop().SetEntityName('');

	for (const seatButton of i.FindEntitiesByName("*_seat*_button"))
		i.ConnectOutput(seatButton, "OnPressed", useVehicle);
});

i.OnPlayerKill((ev) => {
	const [vec, seatNum] = getPlayerVehicle(ev.player);
	if (vec !== null) exitVehicle(vec, seatNum, false);
});

i.OnPlayerDisconnect((_) => {
	for (const [vec, vecData] of occupiedVecs)
		for (const seatNum in vecData.occupants)
			if (vecData.occupants[seatNum].GetPlayerController() == undefined)
				return exitVehicle(vec, seatNum);
});

// --------------------
// IO Functions
// --------------------

function useVehicle({caller, activator}){
	const [seatButton, ply] = [caller, activator];

	const vecName = seatButton.GetEntityName().replace(/_seat\d+_button/, '');
	const vec = i.FindEntityByName(vecName + '_body');
	const seatNum = seatButton.GetEntityName().replace(/.*_seat(\d+)_button/, '$1');

	const occupant = getOccupant(vec, seatNum);
	// not occupied and player is not in a vehicle
	if (occupant == undefined && ! inVehicle(ply))
		enterVehicle(ply, vec, seatNum);
	// already occupied but by same player, then he meant to exit
	else if (occupant === ply)
		exitVehicle(vec, seatNum);
}

function updateOccupantsHealth({value, caller, activator}){
	const [newHp, vec, damageSrc] = [value, caller, activator];
	const vecData = occupiedVecs.get(vec);
	const oldHp = vecData.hp;

	// TODO

	vecData.hp = newHp;
}

function teleportToSeat(ply, vec, seatNum, out=false){
	const vecName = vec.GetEntityName().replace('_body', '');
	const seatName = vecName + '_seat' + seatNum;
	if (!out){
		const seatIn = i.FindEntityByName(seatName + '_in');
		ply.Teleport(seatIn.GetAbsOrigin(), seatIn.GetAbsAngles(), ZEROVECTOR);
	}
	else {
		const seatOut = i.FindEntityByName(seatName + '_out');
		const seatOutAngles = seatOut.GetAbsAngles();
		seatOutAngles.roll = 0;
		ply.Teleport(seatOut.GetAbsOrigin(), seatOutAngles, ZEROVECTOR);
	}
}

// --------------------
// OnThink
// --------------------

i.SetThink(() => {
	while (newOccupantsQueue.length){
		const [ply, vec, seatNum] = newOccupantsQueue.pop();
		teleportToSeat(ply, vec, seatNum);
		ply.SetEntityName('');
	}

	while (newAbandonersQueue.length)
		newAbandonersQueue.pop().SetEntityName('');

	for (const [vec, vecData] of occupiedVecs){
		for (const seatNum in vecData.occupants){
			const ply = vecData.occupants[seatNum];
			const vecName = vec.GetEntityName().replace('_body', '');
			const seatName = vecName + '_seat' + seatNum;
			const seatIn = i.FindEntityByName(seatName + '_in');
			const seatInAngles = seatIn.GetAbsAngles();

			const undrivable = Math.abs(seatInAngles.pitch) > 45 || Math.abs(seatInAngles.roll) > 40;

			// if driver, detect his movement direction to move vehicle before teleporting him
			if (seatNum == 0){
				// stop all thrusters
				setThrusterState(vecName, 'forward', false);
				setThrusterState(vecName, 'right', false);

				// if vehicle is undrivable, use parenting to make dirver orientation follow vehicle angles
				if (undrivable && ply.GetParent() == undefined){
					ply.SetParent(seatIn);
					ply.Teleport(null, {yaw: ply.GetEyeAngles().yaw, pitch: ply.GetEyeAngles().pitch, roll: 0})
				}

				// if drivable, drive
				if (!undrivable) {
					ply.SetParent(null);

					// get driver velocity
					const drvVelVec = ply.GetAbsVelocity();

					// if driver moved
					if ((drvVelVec.x != 0 || drvVelVec.y != 0)){
						// find driver movement yaw relative to his eyes yaw
						const drvYaw = ply.GetEyeAngles().yaw;
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
							setThrusterState(vecName, 'forward', true);
						// backward
						else if (drvRelYaw > 180 - DEVIATION && drvRelYaw < 180 + DEVIATION)
							setThrusterState(vecName, 'forward', true, -1);
						// left
						else if (drvRelYaw > 90 - DEVIATION && drvRelYaw < 90 + DEVIATION)
							setThrusterState(vecName, 'right', true, forward ? -scale : scale);
						// right
						else if (drvRelYaw > 270 - DEVIATION && drvRelYaw < 270 + DEVIATION)
							setThrusterState(vecName, 'right', true, forward ? scale : -scale);
						// forward left
						else if (drvRelYaw > 45 - DEVIATION && drvRelYaw < 45 + DEVIATION){
							setThrusterState(vecName, 'right', true, forward ? -scale : scale);
							setThrusterState(vecName, 'forward', true, 1);
						}
						// forward right
						else if (drvRelYaw > 315 - DEVIATION && drvRelYaw < 315 + DEVIATION){
							setThrusterState(vecName, 'right', true, forward ? scale : -scale);
							setThrusterState(vecName, 'forward', true, 1);
						}
						// backward left
						else if (drvRelYaw > 135 - DEVIATION && drvRelYaw < 135 + DEVIATION){
							setThrusterState(vecName, 'right', true, forward ? -scale : scale);
							setThrusterState(vecName, 'forward', true, -1);
						}
						// backward right
						else if	(drvRelYaw > 225 - DEVIATION && drvRelYaw < 225 + DEVIATION){
							setThrusterState(vecName, 'right', true, forward ? scale : -scale);
							setThrusterState(vecName, 'forward', true, -1);
						}
					}
				}
			}

			const floor = i.FindEntityByName(seatName + '_floor');
			const newOrigin = seatIn.GetAbsOrigin();
			newOrigin.z += 2;
			if (seatNum == 0 && !undrivable){
				floor.Teleport(seatIn.GetAbsOrigin(), ZEROVECTOR, null);
				ply.Teleport(newOrigin, null, ZEROVECTOR);
			}
			else {
				floor.Teleport(seatIn.GetAbsOrigin(), seatInAngles, null);
				ply.Teleport(newOrigin, null, null);
			}
		}
	}
	i.SetNextThink(i.GetGameTime());
});
i.SetNextThink(i.GetGameTime());
