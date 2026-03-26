ALWAYS ASK YOUR SELF : is this the good way ? is it the target ?  

Fix size of model :
    1- get bed dimention of .glb model 
    2- resize model by it's bed dimension and unify unity to 1 or 0.1 to make calculation much easier (so bed will be 100mm*100mm), we call the factor of resize and we resize the whole model
    3- we already scale the model by x10 in printer config  so we nead to resize model before scaling 
    4- now from printer config there is  AXES MAX_TRAVEL_MM for each axis and Bed WIDTH_MM and HEIGHT_MM all those has value 300 by default so basically it's obvious they has relationship with each other , 300mm and we the 100mm of the the bed so we need second factor to calc it's for inner scaling 
    finally we have the model resized than  we scale it the last time with MODEL.SCALE = 10 that we have 

    NOTE : we have in BaseAxis class this.maxTravel  = config.maxTravel  ?? 220; the 220 is suspecious 

fix nozzle start position and home c
    1- in intial state , get the position of the center of the bed
    2- get the position of nozzle (as I remeber it's not directly)
    3- Calc the Dalta between them 
    4- get the env home (x=0,y=0,z=0)  
    5- calc Delta of the bed center and env(x=0,y=0)
    6- calc Delta of the bed center and nozzle
    7- One we start printing before that , move bed to placement, but placement must be checked in calc , we have corner and center, check their values

    is it the good way ? or I just 
    1- get gcode and find the center of the model 
    2- center of model can be :
        a- load code and in sequence find the center , it could be hard ? lot of calcs ?
        b- create gcode model virtualizer, this will load gcode than build a three.js model, get the box and find the x,y center 
    3- apply the center model on the center of the bed , 
    4- find the printing start from gcode and where is it in the adapted position 
    5- it's like a layer between gcode and printer wich convert positions 
    6- make sure when printing start the bed is in good position because nozzle can just move in X axis but X axis is a child of Z axis so bed will be in horizental center if nozzle horizental 

Sperate printer config to 
    Printer profile for simulator 
    and 
    Printer glb model info

    printer_config_js
    simulation_config.js
